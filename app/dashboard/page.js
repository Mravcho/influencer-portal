'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

const PERIODS = [
  { label: 'Всичко',         value: 0  },
  { label: 'Последните 30 дни', value: 30 },
  { label: 'Последните 7 дни',  value: 7  },
]

export default function Dashboard() {
  const router   = useRouter()
  const [data, setData]     = useState(null)
  const [period, setPeriod] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userInfo, setUserInfo] = useState({ name: '', promoCode: '', commission: 0 })

  const load = useCallback(async (days) => {
    setLoading(true)
    const res = await fetch(`/api/dashboard/orders?days=${days}`)
    if (res.status === 401) { router.push('/login'); return }
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUserInfo(d)).catch(() => {})
    load(0)
  }, [load])

  useEffect(() => { if (data) load(period) }, [period]) // eslint-disable-line

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: bg }) } catch { return iso }
  }

  const fmtEur = (n) => `${Number(n).toFixed(2)} €`

  if (loading && !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  const { orders = [], stats = {}, topProducts = [] } = data || {}

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 1.5rem', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--accent-lt)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'var(--accent-dk)',
          }}>
            {userInfo.name?.slice(0, 2).toUpperCase() || '??'}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{userInfo.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Промокод: <strong>{userInfo.promoCode}</strong></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            style={{ width: 'auto', fontSize: 12, padding: '5px 10px' }}
          >
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Изход</button>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
          {[
            { label: 'Поръчки',     value: stats.totalOrders || 0,              sub: `с код ${userInfo.promoCode}` },
            { label: 'Общ приход',  value: fmtEur(stats.totalRevenue || 0),     sub: 'всички поръчки' },
            { label: 'Комисионна',  value: fmtEur(stats.totalCommission || 0),  sub: `${userInfo.commission}% от пълната цена` },
            { label: 'Ср. поръчка', value: fmtEur(stats.avgOrderValue || 0),    sub: 'средна стойност' },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-value">{m.value}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Top products */}
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
              Топ продукти (с отстъпка)
            </div>
            {topProducts.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Няма данни</p>}
            {topProducts.map((p, i) => {
              const maxQty = topProducts[0]?.quantity || 1
              return (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13 }}>{p.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.quantity} бр. · {fmtEur(p.revenue)}</span>
                  </div>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${(p.quantity / maxQty * 100).toFixed(0)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Commission summary */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
                Очаквана комисионна
              </div>
              <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.1 }}>
                {fmtEur(stats.totalCommission || 0)}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                Базирано на {stats.totalOrders || 0} поръчки · {fmtEur(stats.commissionableRevenue || 0)} пълна цена с отстъпка
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Клиентите са спестили общо{' '}
                <strong style={{ color: 'var(--accent-dk)' }}>{fmtEur(stats.totalSavings || 0)}</strong>
              </p>
            </div>
            <div style={{
              marginTop: 16, padding: '10px 14px', background: 'var(--accent-lt)',
              borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: 'var(--accent-dk)', fontWeight: 600 }}>Процент комисионна</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-dk)' }}>{userInfo.commission}%</span>
            </div>
          </div>
        </div>

        {/* Orders table */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Поръчки (анонимизирани — без лични данни)
          </div>
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Продукти</th>
                <th>Сума</th>
                <th>Спестено</th>
                <th>Комисионна</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  Няма поръчки за избрания период
                </td></tr>
              )}
              {orders.map(order => (
                <tr key={order.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.order_number}</td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(order.created_at_shopify)}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(order.line_items || []).map((item, i) => (
                        <span key={i} style={{
                          background: item.discounted ? 'var(--accent-lt)' : 'var(--bg)',
                          border: `1px solid ${item.discounted ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 20, padding: '2px 8px', fontSize: 11,
                        }}>
                          {item.quantity}× {item.title}
                          {item.discounted && (
                            <span style={{ color: 'var(--accent-dk)', marginLeft: 4 }}>
                              -{fmtEur(item.discount_amount)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmtEur(order.total_price)}</td>
                  <td style={{ color: 'green', fontWeight: 600 }}>
                    {fmtEur(order.total_savings || 0)}
                  </td>
                  <td style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {fmtEur(parseFloat(order.commissionable_revenue || 0) * (userInfo.commission / 100))}
                  </td>
                  <td>
                    <span className={`badge ${order.fulfillment_status === 'fulfilled' ? 'badge-green' : 'badge-amber'}`}>
                      {order.fulfillment_status === 'fulfilled' ? 'Изпълнена' : 'В изчакване'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
