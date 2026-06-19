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
  const [merge, setMerge]       = useState(null) // { influencerId, selectedIds, overrides, shippingFromId, busy }

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

  // Има ли друга чакаща заявка от същия инфлуенсър, с която да обединим?
  const hasMergeCandidates = (r) =>
    requests.some(o => o.id !== r.id && o.status === 'pending' && o.influencer?.id === r.influencer?.id)

  const openMerge = (base) => {
    setMsg({})
    setMerge({
      influencerId:   base.influencer?.id,
      selectedIds:    [base.id],
      overrides:      {},
      shippingFromId: base.id,
    })
  }

  const toggleMergeSel = (id) => setMerge(m => {
    const has = m.selectedIds.includes(id)
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

  const submitMerge = async () => {
    if (merge.selectedIds.length < 2) {
      setMsg({ type: 'error', text: 'Избери поне 2 заявки за обединяване.' })
      return
    }
    setMerge(m => ({ ...m, busy: true }))
    setMsg({})
    const overrides = {}
    for (const id of merge.selectedIds) {
      const v = merge.overrides[id]
      if (v != null && v !== '') overrides[id] = { paidUnitPrice: Math.max(0, Number(v) || 0) }
    }
    const res = await fetch('/api/admin/product-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: merge.selectedIds, shippingFromId: merge.shippingFromId, overrides }),
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
        ? `Поръчка ${data.shopify_order_number} е създадена от ${data.merged} заявки.`
        : `Обединени са ${data.merged} заявки в една поръчка.`,
    })
    load()
  }

  const mergeCandidates = merge
    ? requests.filter(r => r.status === 'pending' && r.influencer?.id === merge.influencerId)
    : []
  const mergeTotal = mergeCandidates
    .filter(r => merge?.selectedIds.includes(r.id))
    .reduce((sum, r) => sum + overrideUnit(r) * r.paid_quantity, 0)

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
                        {r.influencer?.name} · <code>{r.influencer?.promo_code}</code>
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
                          onClick={() => act(r.id, 'approve')}
                          disabled={!!busy[r.id]}
                        >
                          {busy[r.id] === 'approve' ? 'Създаване...' : '✓ Одобри (създай поръчка)'}
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
                        {hasMergeCandidates(r) && (
                          <button
                            className="btn btn-sm"
                            style={{ background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}
                            onClick={() => openMerge(r)}
                            disabled={!!busy[r.id]}
                          >
                            🔗 Обедини с друга
                          </button>
                        )}
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
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔗 Обедини в една поръчка</h2>
              <button className="btn btn-sm" onClick={() => !merge.busy && setMerge(null)} style={{ background: 'transparent' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              Една Shopify поръчка с една доставка. Избери кои заявки да включиш и
              коригирай цената на платените бройки (0 = безплатно).
            </div>

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

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, marginBottom: 14, fontSize: 14,
            }}>
              <span style={{ color: 'var(--muted)' }}>
                Обединени заявки: <strong>{merge.selectedIds.length}</strong>
              </span>
              <span>Сума за плащане: <strong>{mergeTotal.toFixed(2)} €</strong></span>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setMerge(null)} disabled={merge.busy}>
                Отказ
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={submitMerge}
                disabled={merge.busy || merge.selectedIds.length < 2}
              >
                {merge.busy ? 'Създаване...' : `✓ Създай 1 поръчка от ${merge.selectedIds.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  )
}
