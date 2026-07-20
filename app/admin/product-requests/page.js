'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'
import AdminShell from '../components/AdminShell'

const STATUS_LABEL = {
  pending:         'Чакаща',
  sent_to_shopify: 'Изпратена в Shopify',
  fulfilled:       'Изпълнена',
  cancelled:       'Отказана',
}

const SHIPPING_LABEL = {
  econt_office:  '📦 Еконт офис',
  speedy_office: '🚚 Спиди офис',
  boxnow:        '📮 BoxNow',
  address:       '🏠 Адрес',
}

const STATUS_BADGE = {
  pending:         { bg: '#fef3c7', color: '#92400e' },
  sent_to_shopify: { bg: '#dbeafe', color: '#1e40af' },
  fulfilled:       { bg: '#d1fae5', color: '#065f46' },
  cancelled:       { bg: '#fee2e2', color: '#991b1b' },
}

export default function ProductRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState([])
  const [filter, setFilter]     = useState('open') // 'open' | 'all'
  const [busy, setBusy]         = useState({})
  const [msg, setMsg]           = useState({ type: '', text: '' })
  const [merge, setMerge]       = useState(null) // конструктор на поръчка: { influencerId, selectedIds, overrides, shippingFromId, extras, busy }
  const [search, setSearch]     = useState({ q: '', results: [], loading: false }) // търсене на доп. продукти

  const load = async () => {
    const url = filter === 'all' ? '/api/admin/product-requests?status=all' : '/api/admin/product-requests'
    const res = await fetch(url)
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    setRequests(await res.json())
  }

  useEffect(() => { load() }, [filter]) // eslint-disable-line

  const act = async (id, action, extra = {}) => {
    setBusy(b => ({ ...b, [id]: action }))
    setMsg({})
    const res = await fetch('/api/admin/product-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, ...extra }),
    })
    const data = await res.json()
    setBusy(b => { const n = { ...b }; delete n[id]; return n })
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return }
    if (action === 'approve') {
      const msg = data.shopify_order_number
        ? `Поръчка ${data.shopify_order_number} е създадена директно в Shopify.`
        : 'Поръчката е създадена в Shopify.'
      setMsg({ type: 'success', text: msg })
    } else {
      setMsg({ type: 'success', text: 'Обновено.' })
    }
    load()
  }

  // Цена/бр. на платените бройки по подразбиране (каталожна цена с отстъпката)
  const defaultPaidUnit = (r) =>
    Number(r.product?.price || 0) * (1 - Number(r.product?.paid_discount_pct || 0) / 100)

  // Отваря конструктора на поръчка за дадена заявка (одобрение + евентуално обединяване + доп. продукти)
  const openOrder = (base) => {
    setMsg({})
    setSearch({ q: '', results: [], loading: false })
    setMerge({
      influencerId:   base.influencer?.id,
      selectedIds:    [base.id],
      overrides:      {},
      shippingFromId: base.id,
      extras:         [],
    })
  }

  const toggleMergeSel = (id) => setMerge(m => {
    const has = m.selectedIds.includes(id)
    if (has && m.selectedIds.length === 1) return m // винаги поне 1 избрана
    const selectedIds = has ? m.selectedIds.filter(x => x !== id) : [...m.selectedIds, id]
    // Ако махнем заявката, чиято доставка ползваме — връщаме се на първата избрана
    const shippingFromId = selectedIds.includes(m.shippingFromId) ? m.shippingFromId : selectedIds[0]
    return { ...m, selectedIds, shippingFromId }
  })

  const setOverride = (id, val) => setMerge(m => ({ ...m, overrides: { ...m.overrides, [id]: val } }))

  const overrideUnit = (r) => {
    const v = merge?.overrides[r.id]
    if (v != null && v !== '') return Math.max(0, Number(v) || 0)
    return defaultPaidUnit(r)
  }

  // --- Доп. продукти (мърч) ---
  const runSearch = async () => {
    const q = search.q.trim()
    if (!q) { setSearch(s => ({ ...s, results: [] })); return }
    setSearch(s => ({ ...s, loading: true }))
    const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setSearch(s => ({ ...s, loading: false, results: res.ok ? data : [] }))
    if (!res.ok) setMsg({ type: 'error', text: data.error || 'Грешка при търсене.' })
  }

  const addExtra = (p) => setMerge(m => {
    if (m.extras.some(e => e.variantId === p.variantId)) return m // вече добавен
    return {
      ...m,
      extras: [...m.extras, {
        variantId:    p.variantId,
        name:         p.variantTitle ? `${p.name} · ${p.variantTitle}` : p.name,
        image:        p.image,
        price:        '0',   // по подразбиране безплатно
        quantity:     1,
      }],
    }
  })

  const updateExtra = (variantId, patch) => setMerge(m => ({
    ...m,
    extras: m.extras.map(e => e.variantId === variantId ? { ...e, ...patch } : e),
  }))

  const removeExtra = (variantId) => setMerge(m => ({
    ...m,
    extras: m.extras.filter(e => e.variantId !== variantId),
  }))

  const submitOrder = async () => {
    if (merge.selectedIds.length < 1) {
      setMsg({ type: 'error', text: 'Избери поне 1 заявка.' })
      return
    }
    setMerge(m => ({ ...m, busy: true }))
    setMsg({})
    const overrides = {}
    for (const id of merge.selectedIds) {
      const v = merge.overrides[id]
      if (v != null && v !== '') overrides[id] = { paidUnitPrice: Math.max(0, Number(v) || 0) }
    }
    const extras = merge.extras.map(e => ({
      variantId: e.variantId,
      name:      e.name,
      quantity:  Math.max(1, parseInt(e.quantity, 10) || 1),
      price:     Math.max(0, Number(e.price) || 0),
    }))
    const res = await fetch('/api/admin/product-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: merge.selectedIds, shippingFromId: merge.shippingFromId, overrides, extras }),
    })
    const data = await res.json()
    if (!res.ok) {
      setMerge(m => ({ ...m, busy: false }))
      setMsg({ type: 'error', text: data.error })
      return
    }
    setMerge(null)
    setMsg({
      type: 'success',
      text: data.shopify_order_number
        ? `Поръчка ${data.shopify_order_number} е създадена в Shopify${data.merged > 1 ? ` (от ${data.merged} заявки)` : ''}.`
        : 'Поръчката е създадена в Shopify.',
    })
    load()
  }

  const mergeCandidates = merge
    ? requests.filter(r => r.status === 'pending' && r.influencer?.id === merge.influencerId)
    : []
  const mergeTotal =
    mergeCandidates
      .filter(r => merge?.selectedIds.includes(r.id))
      .reduce((sum, r) => sum + overrideUnit(r) * r.paid_quantity, 0)
    + (merge?.extras || []).reduce((sum, e) =>
        sum + Math.max(0, Number(e.price) || 0) * Math.max(1, parseInt(e.quantity, 10) || 1), 0)

  return (
    <AdminShell>
      <div className="main-container">
        <div style={{ marginBottom: 20, paddingTop: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>🎁 Заявки за продукти</h1>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Одобрение и изпращане към Shopify</div>
          </div>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            <option value="open">Активни (pending + изпратени)</option>
            <option value="all">Всички</option>
          </select>
        </div>
        {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {requests.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Няма заявки за показване.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(r => {
            const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending
            return (
              <div key={r.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                {r.product?.image_url ? (
                  <img src={r.product.image_url} alt={r.product.name}
                    style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: 8, background: 'var(--bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
                  }}>📦</div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.product?.name || '?'}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {r.influencer?.id ? (
                          <button
                            type="button"
                            onClick={() => router.push(`/admin/view/${r.influencer.id}`)}
                            title="Виж профила на инфлуенсъра"
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              color: 'var(--accent)', fontWeight: 600, fontFamily: 'inherit', fontSize: 12,
                              textDecoration: 'underline', textUnderlineOffset: 2,
                            }}
                          >
                            {r.influencer.name}
                          </button>
                        ) : (
                          r.influencer?.name
                        )}
                        {' · '}<code>{r.influencer?.promo_code}</code>
                      </div>
                    </div>
                    <span style={{
                      background: badge.bg, color: badge.color,
                      padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                      alignSelf: 'flex-start',
                    }}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>

                  <div style={{
                    background: 'var(--bg)', padding: 10, borderRadius: 8, marginBottom: 10, fontSize: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: 'var(--muted)' }}>Общо</span>
                      <span style={{ fontWeight: 600 }}>{r.quantity} бр.</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: 'var(--muted)' }}>Безплатно</span>
                      <span>{r.free_quantity} бр.</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: 'var(--muted)' }}>
                        Платено (с -{r.product?.paid_discount_pct}%)
                      </span>
                      <span>{r.paid_quantity} бр. · {Number(r.paid_total).toFixed(2)} €</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--muted)' }}>Заявено</span>
                      <span>{format(new Date(r.requested_at), 'd MMM yyyy HH:mm', { locale: bg })}</span>
                    </div>
                    {r.shopify_draft_order_id && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span style={{ color: 'var(--muted)' }}>Shopify Order ID</span>
                        <span><code>{r.shopify_draft_order_id}</code></span>
                      </div>
                    )}
                  </div>

                  {r.shipping_method && (
                    <div style={{
                      background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
                      padding: 10, marginBottom: 10, fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {SHIPPING_LABEL[r.shipping_method] || r.shipping_method}
                      </div>
                      <div><strong>Получател:</strong> {r.shipping_recipient || '—'}</div>
                      <div><strong>Телефон:</strong>{' '}
                        {r.shipping_phone
                          ? <a href={`tel:${r.shipping_phone}`} style={{ color: 'var(--accent)' }}>{r.shipping_phone}</a>
                          : '—'}
                      </div>
                      <div><strong>{r.shipping_method === 'address' ? 'Адрес' : 'Офис'}:</strong> {r.shipping_location || '—'}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {r.status === 'pending' && (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => openOrder(r)}
                          disabled={!!busy[r.id]}
                        >
                          ✓ Одобри / създай поръчка
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            const reason = prompt('Причина за отказ (опционално):') || ''
                            if (reason !== null) act(r.id, 'cancel', { notes: reason })
                          }}
                          disabled={!!busy[r.id]}
                        >
                          Откажи
                        </button>
                      </>
                    )}
                    {r.status === 'sent_to_shopify' && (
                      <button
                        className="btn btn-sm"
                        style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}
                        onClick={() => act(r.id, 'fulfilled')}
                        disabled={!!busy[r.id]}
                      >
                        {busy[r.id] === 'fulfilled' ? '...' : 'Маркирай като изпълнена'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {merge && (
        <div
          onClick={() => !merge.busy && setMerge(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: 16, overflowY: 'auto',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="card"
            style={{ maxWidth: 560, width: '100%', marginTop: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>🛒 Създай поръчка</h2>
              <button className="btn btn-sm" onClick={() => !merge.busy && setMerge(null)} style={{ background: 'transparent' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              Една Shopify поръчка с една доставка. Коригирай цената на платените
              бройки (0 = безплатно){mergeCandidates.length > 1 ? ', обедини с други чакащи заявки' : ''} и
              добави доп. продукти (мърч) по преценка.
            </div>

            {mergeCandidates.length > 1 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                Заявки на инфлуенсъра (избери кои да влязат в поръчката):
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {mergeCandidates.map(r => {
                const checked = merge.selectedIds.includes(r.id)
                const unit = overrideUnit(r)
                return (
                  <div key={r.id} style={{
                    border: `1px solid ${checked ? 'var(--accent, #8b5cf6)' : 'var(--border)'}`,
                    borderRadius: 8, padding: 10, fontSize: 13,
                    background: checked ? '#faf5ff' : 'var(--bg)',
                  }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMergeSel(r.id)}
                        style={{ marginTop: 3, width: 'auto' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{r.product?.name || '?'}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          Безплатно: {r.free_quantity} бр. · Платено: {r.paid_quantity} бр.
                        </div>
                      </div>
                    </label>

                    {checked && r.paid_quantity > 0 && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingLeft: 24, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Цена/бр.:</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={merge.overrides[r.id] ?? defaultPaidUnit(r).toFixed(2)}
                          onChange={e => setOverride(r.id, e.target.value)}
                          style={{ width: 90, fontSize: 13 }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                          € · общо {(unit * r.paid_quantity).toFixed(2)} €
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}
                          onClick={() => setOverride(r.id, '0')}
                        >
                          Направи безплатно
                        </button>
                      </div>
                    )}

                    {checked && (
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, paddingLeft: 24, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="shippingFrom"
                          checked={merge.shippingFromId === r.id}
                          onChange={() => setMerge(m => ({ ...m, shippingFromId: r.id }))}
                          style={{ width: 'auto' }}
                        />
                        <span>
                          Ползвай доставката оттук:{' '}
                          <strong>{SHIPPING_LABEL[r.shipping_method] || r.shipping_method || '—'}</strong>
                          {r.shipping_location ? ` · ${r.shipping_location}` : ''}
                        </span>
                      </label>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Доп. продукти (мърч) */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>
                ➕ Добави доп. продукти (мърч) — по подразбиране безплатно
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Търси Shopify продукт по име…"
                  value={search.q}
                  onChange={e => setSearch(s => ({ ...s, q: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
                  style={{ flex: 1, fontSize: 13 }}
                />
                <button type="button" className="btn btn-sm" onClick={runSearch} disabled={search.loading}>
                  {search.loading ? '…' : 'Търси'}
                </button>
              </div>

              {search.results.length > 0 && (
                <div style={{
                  border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10,
                  maxHeight: 220, overflowY: 'auto',
                }}>
                  {search.results.map(p => {
                    const added = merge.extras.some(e => e.variantId === p.variantId)
                    return (
                      <div key={p.variantId} style={{
                        display: 'flex', gap: 8, alignItems: 'center', padding: 8,
                        borderBottom: '1px solid var(--border)', fontSize: 13,
                      }}>
                        {p.image
                          ? <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg)', flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}{p.variantTitle ? ` · ${p.variantTitle}` : ''}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>кат. цена: {p.price.toFixed(2)} €</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => addExtra(p)}
                          disabled={added}
                          style={added ? { opacity: 0.5 } : {}}
                        >
                          {added ? '✓' : 'Добави'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {merge.extras.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {merge.extras.map(e => (
                    <div key={e.variantId} style={{
                      display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                      border: '1px solid #c4b5fd', background: '#faf5ff', borderRadius: 8, padding: 8, fontSize: 13,
                    }}>
                      {e.image
                        ? <img src={e.image} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                        : null}
                      <div style={{ flex: 1, minWidth: 120, fontWeight: 600 }}>{e.name}</div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        бр.
                        <input
                          type="number" min="1" step="1"
                          value={e.quantity}
                          onChange={ev => updateExtra(e.variantId, { quantity: ev.target.value })}
                          style={{ width: 56, fontSize: 13 }}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        цена/бр.
                        <input
                          type="number" min="0" step="0.01"
                          value={e.price}
                          onChange={ev => updateExtra(e.variantId, { price: ev.target.value })}
                          style={{ width: 72, fontSize: 13 }}
                        />
                        €
                      </label>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => removeExtra(e.variantId)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, marginBottom: 14, fontSize: 14,
            }}>
              <span style={{ color: 'var(--muted)' }}>
                Заявки: <strong>{merge.selectedIds.length}</strong>
                {merge.extras.length > 0 ? ` · доп.: ${merge.extras.length}` : ''}
              </span>
              <span>Сума за плащане: <strong>{mergeTotal.toFixed(2)} €</strong></span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setMerge(null)} disabled={merge.busy}>
                Отказ
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={submitOrder}
                disabled={merge.busy || merge.selectedIds.length < 1}
              >
                {merge.busy
                  ? 'Създаване...'
                  : merge.selectedIds.length > 1
                    ? `✓ Създай 1 поръчка от ${merge.selectedIds.length} заявки`
                    : '✓ Създай поръчка'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
