'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

const STATUS_LABEL = {
  pending:         'Чакаща одобрение',
  sent_to_shopify: 'Подготвя се',
  fulfilled:       'Доставена',
  cancelled:       'Отказана',
}

const STATUS_BADGE = {
  pending:         { bg: '#fef3c7', color: '#92400e' },
  sent_to_shopify: { bg: '#dbeafe', color: '#1e40af' },
  fulfilled:       { bg: '#d1fae5', color: '#065f46' },
  cancelled:       { bg: '#fee2e2', color: '#991b1b' },
}

const SHIPPING_LABEL = {
  econt_office:  '📦 Еконт офис',
  speedy_office: '🚚 Спиди офис',
  boxnow:        '📮 BoxNow',
  address:       '🏠 Адрес',
}

export default function MyProductRequestsWidget() {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/dashboard/my-product-requests')
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return null
  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, 5)

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          📜 Моите заявки за продукти
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {items.length} {items.length === 1 ? 'заявка' : 'заявки'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(r => {
          const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending
          return (
            <div key={r.id} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: 10, background: 'var(--bg)', borderRadius: 10,
            }}>
              {r.product?.image_url ? (
                <img src={r.product.image_url} alt={r.product.name}
                  style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 44, height: 44, borderRadius: 6, background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>📦</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.product?.name || '?'}</div>
                  <span style={{
                    background: badge.bg, color: badge.color,
                    padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  {format(new Date(r.requested_at), 'd MMM yyyy', { locale: bg })}
                  {' · '}
                  {r.quantity} бр. ({r.free_quantity} безпл + {r.paid_quantity} плат)
                  {r.paid_total > 0 && <> · <strong>{Number(r.paid_total).toFixed(2)} €</strong></>}
                </div>
                {r.shipping_method && (
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {SHIPPING_LABEL[r.shipping_method] || r.shipping_method}
                    {r.shipping_location && <> · {r.shipping_location}</>}
                  </div>
                )}
                {r.fulfilled_at && (
                  <div style={{ fontSize: 11, color: 'var(--accent-dk)', marginTop: 2 }}>
                    ✓ Доставена на {format(new Date(r.fulfilled_at), 'd MMM yyyy', { locale: bg })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {items.length > 5 && (
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setExpanded(!expanded)}
          style={{ marginTop: 10, width: '100%' }}
        >
          {expanded ? '▲ Скрий' : `▼ Покажи още ${items.length - 5}`}
        </button>
      )}
    </div>
  )
}
