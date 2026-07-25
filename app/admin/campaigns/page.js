'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '../components/AdminShell'

const EMPTY_DISCOUNT = {
  valueType: 'percentage',   // 'percentage' | 'fixed_amount'
  appliesTo: 'all',          // 'all' | 'collections' | 'products'
  collectionIds: [],
  products: [],              // [{ variantId, name, variantTitle }]
  minType: 'none',           // 'none' | 'subtotal' | 'quantity'
  minValue: '',
  usageLimit: '',
  oncePerCustomer: false,
}

const EMPTY_FORM = {
  name: '', promoCode: '', customerDiscountPct: 10, commissionPct: 5,
  destUrl: '', createInShopify: false, startsAt: '', endsAt: '',
  discount: { ...EMPTY_DISCOUNT },
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState([])
  const [selected, setSelected]   = useState(null) // { campaign, links }
  const [form, setForm]           = useState(EMPTY_FORM)
  const [creating, setCreating]   = useState(false)
  const [busy, setBusy]           = useState('')
  const [msg, setMsg]             = useState({ type: '', text: '' })
  const [copied, setCopied]       = useState('')
  const [collections, setCollections] = useState([])
  const [prodSearch, setProdSearch]   = useState({ q: '', results: [], loading: false })

  const setDisc = (patch) => setForm(f => ({ ...f, discount: { ...f.discount, ...patch } }))

  const loadList = async () => {
    const res = await fetch('/api/admin/campaigns')
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    const data = await res.json()
    setCampaigns(data.campaigns || [])
  }

  const loadDetail = async (id) => {
    const res = await fetch(`/api/admin/campaigns?id=${id}`)
    const data = await res.json()
    if (res.ok) setSelected(data)
    else setMsg({ type: 'error', text: data.error })
  }

  useEffect(() => { loadList() }, []) // eslint-disable-line

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Колекции (лениво при нужда)
  const loadCollections = async () => {
    if (collections.length) return
    const res = await fetch('/api/admin/collections')
    const data = await res.json()
    if (res.ok) setCollections(data.collections || [])
  }

  const toggleCollection = (id) => setForm(f => {
    const has = f.discount.collectionIds.includes(id)
    const collectionIds = has
      ? f.discount.collectionIds.filter(x => x !== id)
      : [...f.discount.collectionIds, id]
    return { ...f, discount: { ...f.discount, collectionIds } }
  })

  const searchProducts = async () => {
    const q = prodSearch.q.trim()
    if (!q) { setProdSearch(s => ({ ...s, results: [] })); return }
    setProdSearch(s => ({ ...s, loading: true }))
    const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setProdSearch(s => ({ ...s, loading: false, results: res.ok ? data : [] }))
  }

  const addProduct = (p) => setForm(f => {
    if (f.discount.products.some(x => x.variantId === p.variantId)) return f
    return { ...f, discount: { ...f.discount, products: [...f.discount.products, p] } }
  })
  const removeProduct = (variantId) => setForm(f => ({
    ...f, discount: { ...f.discount, products: f.discount.products.filter(p => p.variantId !== variantId) },
  }))

  const createCampaign = async (e) => {
    e.preventDefault()
    setCreating(true); setMsg({})
    const payload = {
      ...form,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
      endsAt:   form.endsAt   ? new Date(form.endsAt).toISOString()   : '',
      discount: form.createInShopify ? {
        valueType:       form.discount.valueType,
        appliesTo:       form.discount.appliesTo,
        collectionIds:   form.discount.collectionIds,
        variantIds:      form.discount.products.map(p => p.variantId),
        minType:         form.discount.minType,
        minValue:        form.discount.minValue,
        usageLimit:      form.discount.usageLimit,
        oncePerCustomer: form.discount.oncePerCustomer,
      } : undefined,
    }
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({ type: 'success', text: 'Кампанията е създадена.' })
    setForm({ ...EMPTY_FORM, discount: { ...EMPTY_DISCOUNT } })
    setProdSearch({ q: '', results: [], loading: false })
    loadList()
    loadDetail(data.id)
  }

  const generateLinks = async () => {
    if (!selected) return
    setBusy('generate'); setMsg({})
    const res = await fetch('/api/admin/campaigns/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: selected.campaign.id }),
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({ type: 'success', text: `Готово: ${data.created} нови · ${data.reused} обновени (един стабилен линк на инфлуенсър).` })
    loadDetail(selected.campaign.id)
  }

  const deleteCampaign = async () => {
    if (!selected) return
    const c = selected.campaign
    if (!confirm(`Изтрий кампанията „${c.name}"?\n\nПоръчките и комисионните се ЗАПАЗВАТ (за история и изплащане). Кампанията изчезва от списъка.`)) return
    // Избор: да трием ли и кода в Shopify
    const alsoShopify = confirm(
      `Да изтрия ли и промокода „${c.promo_code}" от Shopify?\n\n` +
      `„OK“ = изтрий и кода от Shopify\n` +
      `„Отказ“ = запази кода в Shopify (трие се само кампанията тук)`
    )
    setBusy('delete'); setMsg({})
    const res = await fetch(`/api/admin/campaigns?id=${c.id}&deleteShopify=${alsoShopify}`, { method: 'DELETE' })
    const data = await res.json()
    setBusy('')
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({
      type: 'success',
      text: 'Кампанията е изтрита' + (data.shopify?.deleted
        ? ' (кодът е премахнат и от Shopify).'
        : (alsoShopify ? ' (кодът в Shopify не бе намерен).' : ' (кодът в Shopify е запазен).')),
    })
    setSelected(null)
    loadList()
  }

  const toggleActive = async () => {
    if (!selected) return
    const res = await fetch('/api/admin/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.campaign.id, active: !selected.campaign.active }),
    })
    if (res.ok) { loadDetail(selected.campaign.id); loadList() }
  }

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch {}
  }

  return (
    <AdminShell>
      <div className="main-container">
        <div style={{ marginBottom: 20, paddingTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>📣 Кампании</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Споделен промокод за отстъпка + личен UTM линк на всеки инфлуенсър за комисионна
          </div>
        </div>

        {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* Ляво: създаване + списък */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <form className="card" onSubmit={createCampaign}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Нова кампания</div>
              <label style={lbl}>Име *</label>
              <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Лято 2026" style={inp} />
              <label style={lbl}>Промокод *</label>
              <input value={form.promoCode} onChange={e => setField('promoCode', e.target.value.toUpperCase())} placeholder="REALFOOD10" style={inp} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Отстъпка клиент {form.discount.valueType === 'fixed_amount' ? '€' : '%'}</label>
                  <input type="number" min="0" step="0.5" value={form.customerDiscountPct} onChange={e => setField('customerDiscountPct', e.target.value)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Комисионна %</label>
                  <input type="number" min="0" step="0.5" value={form.commissionPct} onChange={e => setField('commissionPct', e.target.value)} style={inp} />
                </div>
              </div>
              <label style={lbl}>Дестинация (по избор)</label>
              <input value={form.destUrl} onChange={e => setField('destUrl', e.target.value)} placeholder="напр. /collections/all (по подр. магазина)" style={inp} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Валидна от (дата и час)</label>
                  <input type="datetime-local" value={form.startsAt} onChange={e => setField('startsAt', e.target.value)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Валидна до (дата и час)</label>
                  <input type="datetime-local" value={form.endsAt} onChange={e => setField('endsAt', e.target.value)} style={inp} />
                </div>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '6px 0 12px' }}>
                <input type="checkbox" checked={form.createInShopify} onChange={e => setField('createInShopify', e.target.checked)} style={{ width: 'auto' }} />
                Създай кода в Shopify (иначе трябва вече да съществува)
              </label>

              {form.createInShopify && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12, background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Опции на промокода в Shopify</div>

                  <label style={lbl}>Тип отстъпка</label>
                  <select value={form.discount.valueType} onChange={e => setDisc({ valueType: e.target.value })} style={inp}>
                    <option value="percentage">Процент (%)</option>
                    <option value="fixed_amount">Фиксирана сума (€)</option>
                  </select>

                  <label style={lbl}>За кои продукти важи</label>
                  <select
                    value={form.discount.appliesTo}
                    onChange={e => { setDisc({ appliesTo: e.target.value }); if (e.target.value === 'collections') loadCollections() }}
                    style={inp}
                  >
                    <option value="all">Всички продукти</option>
                    <option value="collections">Избрани колекции</option>
                    <option value="products">Избрани продукти</option>
                  </select>

                  {form.discount.appliesTo === 'collections' && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, margin: '6px 0' }}>
                      {collections.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Зареждане…</div>}
                      {collections.map(c => (
                        <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={form.discount.collectionIds.includes(c.id)}
                            onChange={() => toggleCollection(c.id)}
                            style={{ width: 'auto' }}
                          />
                          {c.title}
                        </label>
                      ))}
                    </div>
                  )}

                  {form.discount.appliesTo === 'products' && (
                    <div style={{ margin: '6px 0' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text" placeholder="Търси продукт…"
                          value={prodSearch.q}
                          onChange={e => setProdSearch(s => ({ ...s, q: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchProducts() } }}
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        <button type="button" className="btn btn-sm" onClick={searchProducts} disabled={prodSearch.loading}>
                          {prodSearch.loading ? '…' : 'Търси'}
                        </button>
                      </div>
                      {prodSearch.results.length > 0 && (
                        <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginTop: 6 }}>
                          {prodSearch.results.map(p => (
                            <div key={p.variantId} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 6, fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                              <span style={{ flex: 1 }}>{p.name}{p.variantTitle ? ` · ${p.variantTitle}` : ''}</span>
                              <button type="button" className="btn btn-sm" onClick={() => addProduct(p)}
                                disabled={form.discount.products.some(x => x.variantId === p.variantId)}>
                                {form.discount.products.some(x => x.variantId === p.variantId) ? '✓' : '+'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {form.discount.products.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          {form.discount.products.map(p => (
                            <span key={p.variantId} style={{ fontSize: 11, background: 'var(--accent-lt)', color: 'var(--accent-dk)', borderRadius: 12, padding: '3px 8px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {p.name}{p.variantTitle ? ` · ${p.variantTitle}` : ''}
                              <button type="button" onClick={() => removeProduct(p.variantId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <label style={lbl}>Минимално изискване</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={form.discount.minType} onChange={e => setDisc({ minType: e.target.value })} style={{ flex: 1, fontSize: 13 }}>
                      <option value="none">Няма</option>
                      <option value="subtotal">Мин. сума (€)</option>
                      <option value="quantity">Мин. брой</option>
                    </select>
                    {form.discount.minType !== 'none' && (
                      <input type="number" min="0" value={form.discount.minValue} onChange={e => setDisc({ minValue: e.target.value })} style={{ width: 90, fontSize: 13 }} placeholder={form.discount.minType === 'subtotal' ? '€' : 'бр.'} />
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Лимит употреби (по избор)</label>
                      <input type="number" min="0" value={form.discount.usageLimit} onChange={e => setDisc({ usageLimit: e.target.value })} style={inp} placeholder="без лимит" />
                    </div>
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 8 }}>
                    <input type="checkbox" checked={form.discount.oncePerCustomer} onChange={e => setDisc({ oncePerCustomer: e.target.checked })} style={{ width: 'auto' }} />
                    Само веднъж на клиент
                  </label>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-sm" disabled={creating} style={{ width: '100%' }}>
                {creating ? 'Създаване...' : 'Създай кампания'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {campaigns.map(c => (
                <button
                  key={c.id}
                  onClick={() => loadDetail(c.id)}
                  className="card"
                  style={{
                    textAlign: 'left', cursor: 'pointer', border: `1px solid ${selected?.campaign.id === c.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected?.campaign.id === c.id ? 'var(--accent-lt)' : 'var(--card-bg, #fff)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: c.active ? '#065f46' : 'var(--muted)' }}>
                      {c.active ? '● активна' : '○ спряна'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    <code>{c.promo_code}</code> · -{c.customer_discount_pct}% клиент · {c.commission_pct}% комис.
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {c.links_count} линка · {c.orders_count} поръчки
                  </div>
                </button>
              ))}
              {campaigns.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', padding: 8 }}>Още няма кампании.</div>
              )}
            </div>
          </div>

          {/* Дясно: детайл */}
          <div>
            {!selected ? (
              <div className="card" style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>
                Избери кампания отляво или създай нова.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.campaign.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                        Код: <code>{selected.campaign.promo_code}</code> · Клиент -{selected.campaign.customer_discount_pct}% · Комисионна {selected.campaign.commission_pct}%
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={toggleActive}>
                        {selected.campaign.active ? 'Спри' : 'Активирай'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={deleteCampaign} disabled={busy === 'delete'}>
                        {busy === 'delete' ? 'Изтриване...' : '🗑 Изтрий'}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-primary" onClick={generateLinks} disabled={busy === 'generate'}>
                      {busy === 'generate' ? 'Генериране...' : '🔗 Генерирай линкове за всички'}
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
                      ⚡ Поръчките се засичат автоматично по UTM (реално време + всеки час).
                    </span>
                  </div>
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
                    Инфлуенсъри и линкове ({selected.links.length})
                  </div>
                  {selected.links.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>
                      Още няма линкове. Натисни „Генерирай линкове за всички".
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                            <th style={th}>Инфлуенсър</th>
                            <th style={th}>Кликове</th>
                            <th style={th}>Поръчки</th>
                            <th style={th}>Комисионна</th>
                            <th style={th}>Линк</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.links.map(l => (
                            <tr key={l.link_id} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={td}>
                                <div style={{ fontWeight: 600 }}>{l.influencer?.name || '—'}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}><code>{l.influencer?.promo_code}</code></div>
                              </td>
                              <td style={td}>{l.clicks}</td>
                              <td style={td}>{l.orders}</td>
                              <td style={td}>{l.commission.toFixed(2)} €</td>
                              <td style={td}>
                                <button className="btn btn-sm" onClick={() => copy(l.shortUrl, l.link_id)} title={l.shortUrl}>
                                  {copied === l.link_id ? '✓ Копирано' : '📋 Копирай'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  )
}

const lbl = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4, marginTop: 8 }
const inp = { width: '100%', fontSize: 13 }
const th  = { padding: '8px 12px', fontWeight: 600, whiteSpace: 'nowrap' }
const td  = { padding: '10px 12px', verticalAlign: 'top' }
