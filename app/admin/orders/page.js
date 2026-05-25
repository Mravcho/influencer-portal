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

        {/* Table */}
        <div className="card table-wrap">
          {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem' }}>Зареждане...</p>}

          {!loading && orders.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>
              Няма поръчки за избраните филтри.
            </p>
          )}

          {!loading && orders.length > 0 && (
            <table style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>№</th>
                  <th>Клиент</th>
                  <th>Град</th>
                  <th>Продукти</th>
                  <th>Сума</th>
                  <th>Отстъпка</th>
                  <th>Инфлуенсър</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtDate(o.created_at_shopify)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.order_number}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.customer_name || <span style={{ color: 'var(--muted)' }}>—</span>}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {o.customer_email && <div>{o.customer_email}</div>}
                        {o.customer_phone && (
                          <div><a href={`tel:${o.customer_phone}`} style={{ color: 'var(--accent)' }}>{o.customer_phone}</a></div>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{o.shipping_city || '—'}</td>
                    <td>
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
                    </td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(o.total_price)}</td>
                    <td style={{ color: '#16a34a', whiteSpace: 'nowrap' }}>
                      {parseFloat(o.total_savings || 0) > 0 ? `−${fmtEur(o.total_savings)}` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {o.influencer?.avatar_url ? (
                          <img src={o.influencer.avatar_url} alt={o.influencer.name}
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-lt)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0,
                          }}>{o.influencer?.name?.slice(0, 2).toUpperCase()}</div>
                        )}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{o.influencer?.name || '?'}</div>
                          <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>
                            {o.influencer?.promo_code || '—'}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td><OrderStatusBadge order={o} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
