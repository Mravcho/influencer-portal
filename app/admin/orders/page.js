'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

export default function AdminOrdersPage() {
  const router = useRouter()
  const [orders, setOrders]         = useState([])
  const [influencers, setInfluencers] = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [influencerId, setInfluencerId] = useState('')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search)       params.set('search', search)
    if (influencerId) params.set('influencer_id', influencerId)
    const res = await fetch(`/api/admin/orders?${params.toString()}`)
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    setOrders(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/admin/influencers').then(r => r.json()).then(setInfluencers).catch(() => {})
  }, [])

  useEffect(() => { load() }, [influencerId]) // eslint-disable-line

  const onSearchSubmit = (e) => { e.preventDefault(); load() }

  const totals = useMemo(() => {
    return orders.reduce((acc, o) => {
      acc.count    += 1
      acc.revenue  += parseFloat(o.total_price || 0)
      acc.savings  += parseFloat(o.total_savings || 0)
      return acc
    }, { count: 0, revenue: 0, savings: 0 })
  }, [orders])

  const fmtEur  = (n) => `${Number(n || 0).toFixed(2)} €`
  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMM yyyy HH:mm', { locale: bg }) } catch { return iso }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>📋 Поръчки</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Всички поръчки през промокод от всички инфлуенсъри</div>
          </div>
        </div>
      </header>

      <main className="main-container">
        {/* Filters */}
        <div className="card" style={{ marginBottom: '1rem', padding: '14px' }}>
          <form onSubmit={onSearchSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={influencerId}
              onChange={e => setInfluencerId(e.target.value)}
              style={{ width: 'auto', fontSize: 12, padding: '6px 10px' }}
            >
              <option value="">Всички инфлуенсъри</option>
              {influencers.map(i => (
                <option key={i.id} value={i.id}>{i.name} · {i.promo_code}</option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Търси по име, имейл, телефон, № поръчка, град..."
              style={{ flex: 1, minWidth: 200, fontSize: 12, padding: '6px 10px' }}
            />
            <button type="submit" className="btn btn-sm btn-primary">Търси</button>
            {(search || influencerId) && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => { setSearch(''); setInfluencerId(''); }}
              >Изчисти</button>
            )}
          </form>
        </div>

        {/* Summary */}
        <div className="grid-3" style={{ marginBottom: '1rem' }}>
          <div className="metric">
            <div className="metric-label">Заредени поръчки</div>
            <div className="metric-value">{totals.count}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Общ оборот</div>
            <div className="metric-value">{fmtEur(totals.revenue)}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Спестено от клиентите</div>
            <div className="metric-value">{fmtEur(totals.savings)}</div>
          </div>
        </div>

        {/* Order cards */}
        {loading && (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem' }}>Зареждане...</p>
        )}

        {!loading && orders.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Няма поръчки за избраните филтри.
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.map(o => (
              <div key={o.id} className="card" style={{ padding: 14 }}>
                {/* Ред 1: дата · № · status (вдясно) */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, flexWrap: 'wrap', marginBottom: 10, paddingBottom: 10,
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(o.created_at_shopify)}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{o.order_number}</span>
                  </div>
                  <OrderStatusBadge order={o} />
                </div>

                {/* Grid: клиент (ляво) · инфлуенсър (дясно) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 1fr) auto',
                  gap: 16,
                  alignItems: 'flex-start',
                  marginBottom: 10,
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                      Клиент
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {o.customer_name || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— без име</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 2 }}>
                      {o.customer_email && (
                        <a href={`mailto:${o.customer_email}`} style={{ color: 'var(--accent)' }}>
                          ✉ {o.customer_email}
                        </a>
                      )}
                      {o.customer_phone && (
                        <a href={`tel:${o.customer_phone}`} style={{ color: 'var(--accent)' }}>
                          📞 {o.customer_phone}
                        </a>
                      )}
                      {o.shipping_city && <span>📍 {o.shipping_city}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                      Инфлуенсър
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      {o.influencer?.avatar_url ? (
                        <img src={o.influencer.avatar_url} alt={o.influencer.name}
                          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-lt)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0,
                        }}>{o.influencer?.name?.slice(0, 2).toUpperCase()}</div>
                      )}
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{o.influencer?.name || '?'}</div>
                        <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>
                          {o.influencer?.promo_code || '—'}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Продукти */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                    Продукти
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(o.line_items || []).map((item, i) => (
                      <span key={i} className={`product-chip ${item.discounted ? 'discounted' : ''}`}>
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="product-thumb" style={{ width: 22, height: 22 }} />
                        ) : (
                          <span className="product-thumb-placeholder" style={{ width: 22, height: 22, fontSize: 9 }}>
                            {item.title?.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span>{item.quantity}× {item.title}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer: суми */}
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', gap: 18, flexWrap: 'wrap',
                  paddingTop: 10, borderTop: '1px solid var(--border)',
                }}>
                  {parseFloat(o.total_savings || 0) > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Отстъпка</div>
                      <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 14 }}>−{fmtEur(o.total_savings)}</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Платено</div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-dk)', fontSize: 16 }}>{fmtEur(o.total_price)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function OrderStatusBadge({ order }) {
  const fin = order.financial_status
  const ful = order.fulfillment_status
  if (fin === 'refunded')           return <span className="badge badge-gray">Рефундирана</span>
  if (fin === 'partially_refunded') return <span className="badge badge-gray">Част. рефунд</span>
  if (fin === 'voided')             return <span className="badge badge-gray">Отказана</span>
  if (ful === 'fulfilled')          return <span className="badge badge-green">Изпълнена</span>
  return <span className="badge badge-amber">В изчакване</span>
}
