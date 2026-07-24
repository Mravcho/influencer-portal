'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '../components/AdminShell'

const EMPTY_FORM = {
  name: '', promoCode: '', customerDiscountPct: 10, commissionPct: 5,
  destUrl: '', createInShopify: false, startsAt: '', endsAt: '',
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

  const createCampaign = async (e) => {
    e.preventDefault()
    setCreating(true); setMsg({})
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({ type: 'success', text: 'Кампанията е създадена.' })
    setForm(EMPTY_FORM)
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
    setMsg({ type: 'success', text: `Създадени ${data.created} нови линка (${data.already_had} вече имаха).` })
    loadDetail(selected.campaign.id)
  }

  const syncOrders = async () => {
    if (!selected) return
    setBusy('sync'); setMsg({})
    const res = await fetch('/api/admin/campaigns/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: selected.campaign.id }),
    })
    const data = await res.json()
    setBusy('')
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    setMsg({
      type: 'success',
      text: `Синк готов: ${data.attributed} приписани, ${data.unattributed} без UTM (от ${data.fetched} с кода).`,
    })
    loadDetail(selected.campaign.id)
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
                  <label style={lbl}>Отстъпка клиент %</label>
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
                  <label style={lbl}>Начало (по избор)</label>
                  <input type="date" value={form.startsAt} onChange={e => setField('startsAt', e.target.value)} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Край (по избор)</label>
                  <input type="date" value={form.endsAt} onChange={e => setField('endsAt', e.target.value)} style={inp} />
                </div>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '6px 0 12px' }}>
                <input type="checkbox" checked={form.createInShopify} onChange={e => setField('createInShopify', e.target.checked)} style={{ width: 'auto' }} />
                Създай кода в Shopify (иначе трябва вече да съществува)
              </label>
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
                    <button className="btn btn-sm" onClick={toggleActive}>
                      {selected.campaign.active ? 'Спри' : 'Активирай'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-sm btn-primary" onClick={generateLinks} disabled={busy === 'generate'}>
                      {busy === 'generate' ? 'Генериране...' : '🔗 Генерирай линкове за всички'}
                    </button>
                    <button className="btn btn-sm" onClick={syncOrders} disabled={busy === 'sync'}>
                      {busy === 'sync' ? 'Синк...' : '🔄 Синк поръчки (UTM)'}
                    </button>
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
