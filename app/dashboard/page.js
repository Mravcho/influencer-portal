'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { bg } from 'date-fns/locale'

function ymd(d) {
  return format(d, 'yyyy-MM-dd')
}

function buildShortcuts() {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const lastMonthDate  = subMonths(now, 1)
  const lastMonthStart = startOfMonth(lastMonthDate)
  const lastMonthEnd   = endOfMonth(lastMonthDate)
  return [
    { key: 'all',    label: 'Всичко',       from: '', to: '' },
    { key: '7',      label: '7 дни',        days: 7 },
    { key: '30',     label: '30 дни',       days: 30 },
    { key: 'tm',     label: 'Този месец',   from: ymd(thisMonthStart), to: ymd(now) },
    { key: 'lm',     label: 'Минал месец',  from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
  ]
}

export default function Dashboard() {
  const router = useRouter()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [userInfo, setUserInfo] = useState({ name: '', promoCode: '', commission: 0 })
  const [branding, setBranding] = useState({ logo_url: null })

  const [activeShortcut, setActiveShortcut] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const shortcuts = useMemo(() => buildShortcuts(), [])

  const load = useCallback(async ({ days, from, to }) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    if (!from && !to && days) params.set('days', String(days))
    const res = await fetch(`/api/dashboard/orders?${params.toString()}`)
    if (res.status === 401) { router.push('/login'); return }
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [router])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUserInfo(d)).catch(() => {})
    fetch('/api/public/branding').then(r => r.json()).then(d => setBranding(d)).catch(() => {})
    load({ days: 0 })
  }, [load])

  const applyShortcut = (sc) => {
    setActiveShortcut(sc.key)
    if (sc.days) {
      setFrom(''); setTo('')
      load({ days: sc.days })
    } else {
      setFrom(sc.from); setTo(sc.to)
      load({ from: sc.from, to: sc.to })
    }
  }

  const applyCustom = () => {
    if (!from && !to) return
    setActiveShortcut('custom')
    load({ from, to })
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: bg }) } catch { return iso }
  }
  const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="Logo" style={{ height: 32, maxWidth: 120, objectFit: 'contain' }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--accent-lt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'var(--accent-dk)',
            }}>
              {userInfo.name?.slice(0, 2).toUpperCase() || '??'}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{userInfo.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Промокод: <strong>{userInfo.promoCode}</strong></div>
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={logout}>Изход</button>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
        {/* Hero gradient card */}
        <div style={{
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dk) 100%)',
          borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem',
          color: '#fff', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
            borderRadius: '50%', background: 'rgba(255,255,255,.1)',
          }} />
          <div style={{
            position: 'absolute', bottom: -60, right: 80, width: 140, height: 140,
            borderRadius: '50%', background: 'rgba(255,255,255,.08)',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 12, opacity: .85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Очаквана комисионна
            </div>
            <div style={{ fontSize: 42, fontWeight: 700, margin: '4px 0' }}>
              {fmtEur(stats.totalCommission || 0)}
            </div>
            <div style={{ fontSize: 13, opacity: .9 }}>
              {stats.totalOrders || 0} поръчки · {userInfo.commission}% комисионна · клиентите спестиха <strong>{fmtEur(stats.totalSavings || 0)}</strong>
            </div>
          </div>
        </div>

        {/* Date filters */}
        <div className="card" style={{ marginBottom: '1rem', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 8 }}>
              Период:
            </div>
            {shortcuts.map(sc => (
              <button
                key={sc.key}
                className={`chip ${activeShortcut === sc.key ? 'active' : ''}`}
                onClick={() => applyShortcut(sc)}
              >
                {sc.label}
              </button>
            ))}
            <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              style={{ width: 'auto', fontSize: 12, padding: '5px 8px' }}
            />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              style={{ width: 'auto', fontSize: 12, padding: '5px 8px' }}
            />
            <button
              className={`chip ${activeShortcut === 'custom' ? 'active' : ''}`}
              onClick={applyCustom}
              disabled={!from && !to}
            >
              Приложи
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '1.5rem' }}>
          {[
            { label: 'Поръчки',     value: stats.totalOrders || 0,             sub: `с код ${userInfo.promoCode}` },
            { label: 'Общ приход',  value: fmtEur(stats.totalRevenue || 0),    sub: 'платено от клиентите' },
            { label: 'Комисионна',  value: fmtEur(stats.totalCommission || 0), sub: `${userInfo.commission}% от пълната цена` },
            { label: 'Ср. поръчка', value: fmtEur(stats.avgOrderValue || 0),   sub: 'средна стойност' },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-value">{m.value}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Top products with images */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Топ продукти (с отстъпка)
          </div>
          {topProducts.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Няма данни</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {topProducts.map((p, i) => (
              <div key={i} style={{
                background: 'var(--bg)', borderRadius: 12, padding: 12,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.title} style={{
                    width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
                    objectFit: 'cover', background: '#fff',
                  }} />
                ) : (
                  <div style={{
                    width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
                    background: 'var(--accent-lt)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700, color: 'var(--accent-dk)',
                  }}>
                    {p.title?.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {p.quantity} бр. · {fmtEur(p.revenue)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders table */}
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Поръчки (анонимизирани — без лични данни)
          </div>
          <table style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Продукти</th>
                <th title="Пълна цена преди отстъпката">Преди отстъпка</th>
                <th title="Спестено от клиента чрез промокода">Отстъпка</th>
                <th title="Сума платена от клиента след отстъпката">Платена</th>
                <th title="Доставка (не влиза в комисионната)">Доставка</th>
                <th title={`${userInfo.commission}% от пълната цена`}>Комисионна</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
                  Няма поръчки за избрания период
                </td></tr>
              )}
              {orders.map(order => {
                const fullPrice = parseFloat(order.commissionable_revenue || 0)
                const savings   = parseFloat(order.total_savings || 0)
                const paid      = parseFloat(order.total_price || 0)
                const shipping  = parseFloat(order.shipping_total || 0)
                const comm      = fullPrice * (userInfo.commission / 100)

                return (
                  <tr key={order.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{order.order_number}</td>
                    <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(order.created_at_shopify)}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(order.line_items || []).map((item, i) => (
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
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(fullPrice)}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {savings > 0 ? `−${fmtEur(savings)}` : '—'}
                    </td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(paid)}</td>
                    <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {shipping > 0 ? fmtEur(shipping) : '—'}
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtEur(comm)}
                    </td>
                    <td>
                      <OrderStatusBadge order={order} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

function OrderStatusBadge({ order }) {
  const fin = order.financial_status
  const ful = order.fulfillment_status

  if (fin === 'refunded') return <span className="badge badge-gray">Рефундирана</span>
  if (fin === 'partially_refunded') return <span className="badge badge-gray">Част. рефунд</span>
  if (fin === 'voided') return <span className="badge badge-gray">Отказана</span>
  if (ful === 'fulfilled') return <span className="badge badge-green">Изпълнена</span>
  return <span className="badge badge-amber">В изчакване</span>
}
