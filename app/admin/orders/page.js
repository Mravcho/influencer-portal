'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'
import AdminShell from '../components/AdminShell'

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
    <AdminShell>
      <div className="main-container">
        <div style={{ marginBottom: 20, paddingTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>📋 Поръчки</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Всички поръчки през промокод от всички инфлуенсъри
          </div>
        </div>
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

        {/* Table */}
        <div className="card table-wrap">
          {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem' }}>Зареждане...</p>}

          {!loading && orders.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>
              Няма поръчки за избраните филтри.
            </p>
          )}

          {!loading && orders.length > 0 && (
            <table style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Дата</th>
                  <th>Клиент</th>
                  <th>Продукти</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Сума</th>
                  <th style={{ width: 160 }}>Инфлуенсър</th>
                  <th style={{ width: 90 }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={{ verticalAlign: 'top' }}>
                    {/* Дата + № */}
                    <td style={{ padding: '8px 6px' }}>
                      <div>{fmtDate(o.created_at_shopify)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)' }}>
                        {o.order_number}
                      </div>
                    </td>

                    {/* Клиент: име + (имейл · телефон · град) */}
                    <td style={{ padding: '8px 6px' }}>
                      <div style={{ fontWeight: 600 }}>
                        {o.customer_name || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>—</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
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
                    </td>

                    {/* Продукти chip-ове */}
                    <td style={{ padding: '8px 6px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(o.line_items || []).map((item, i) => (
                          <span
                            key={i}
                            className={`product-chip ${item.discounted ? 'discounted' : ''}`}
                            style={{ fontSize: 10, padding: '2px 6px' }}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt="" className="product-thumb" style={{ width: 18, height: 18 }} />
                            ) : (
                              <span className="product-thumb-placeholder" style={{ width: 18, height: 18, fontSize: 8 }}>
                                {item.title?.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span>{item.quantity}× {item.title}</span>
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Сума + (отстъпка) */}
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--accent-dk)' }}>{fmtEur(o.total_price)}</div>
                      {parseFloat(o.total_savings || 0) > 0 && (
                        <div style={{ fontSize: 10, color: '#16a34a' }}>
                          −{fmtEur(o.total_savings)}
                        </div>
                      )}
                    </td>

                    {/* Инфлуенсър: име + промокод */}
                    <td style={{ padding: '8px 6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {o.influencer?.avatar_url ? (
                          <img src={o.influencer.avatar_url} alt={o.influencer.name}
                            style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-lt)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0,
                          }}>{o.influencer?.name?.slice(0, 2).toUpperCase()}</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{o.influencer?.name || '?'}</div>
                          <code style={{ background: 'var(--bg)', padding: '0 4px', borderRadius: 3, fontSize: 10 }}>
                            {o.influencer?.promo_code || '—'}
                          </code>
                        </div>
                      </div>
                    </td>

                    {/* Статус */}
                    <td style={{ padding: '8px 6px' }}>
                      <OrderStatusBadge order={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
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
