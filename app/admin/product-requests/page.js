'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

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
    if (action === 'approve' && data.draft_order_invoice_url) {
      setMsg({ type: 'success', text: 'Draft Order е създаден в Shopify. Отвори линка и довърши с адрес за доставка.' })
    } else {
      setMsg({ type: 'success', text: 'Обновено.' })
    }
    load()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>🎁 Заявки за продукти</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Одобрение и изпращане към Shopify</div>
          </div>
        </div>
        <div className="header-actions">
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            <option value="open">Активни (pending + изпратени)</option>
            <option value="all">Всички</option>
          </select>
        </div>
      </header>

      <main className="main-container">
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
                        <span style={{ color: 'var(--muted)' }}>Shopify Draft</span>
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
                          {busy[r.id] === 'approve' ? 'Създаване...' : '✓ Одобри (Draft Order)'}
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
      </main>
    </div>
  )
}
