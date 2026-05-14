'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { bg } from 'date-fns/locale'
import InfluencerLeaderboard from '@/app/dashboard/components/InfluencerLeaderboard'
import PayoutWidget from '@/app/dashboard/components/PayoutWidget'
import ShareLinksWidget from '@/app/dashboard/components/ShareLinksWidget'

function ymd(d) { return format(d, 'yyyy-MM-dd') }

function buildShortcuts() {
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const lastMonthDate  = subMonths(now, 1)
  const lastMonthStart = startOfMonth(lastMonthDate)
  const lastMonthEnd   = endOfMonth(lastMonthDate)
  return [
    { key: 'all', label: 'Всичко',     from: '', to: '' },
    { key: '7',   label: '7 дни',       days: 7 },
    { key: '30',  label: '30 дни',      days: 30 },
    { key: 'tm',  label: 'Този месец',  from: ymd(thisMonthStart), to: ymd(now) },
    { key: 'lm',  label: 'Минал месец', from: ymd(lastMonthStart), to: ymd(lastMonthEnd) },
  ]
}

export default function AdminInfluencerView() {
  const router = useRouter()
  const { id } = useParams()

  const [influencer, setInfluencer] = useState(null)
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [activeShortcut, setActiveShortcut] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const shortcuts = useMemo(() => buildShortcuts(), [])

  useEffect(() => {
    fetch('/api/admin/influencers')
      .then(r => r.json())
      .then(list => {
        const found = list.find(i => i.id === id)
        if (!found) { router.push('/admin'); return }
        setInfluencer(found)
      })
      .catch(() => router.push('/admin'))
  }, [id, router])

  const load = useCallback(async ({ days, from, to }) => {
    if (!id) return
    setLoading(true)
    const params = new URLSearchParams({ viewId: id })
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    if (!from && !to && days) params.set('days', String(days))
    const res = await fetch(`/api/dashboard/orders?${params.toString()}`)
    if (res.status === 401 || res.status === 403) { router.push('/admin'); return }
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [id, router])

  useEffect(() => { if (id) load({ days: 0 }) }, [load, id])

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

  const fmtDate = (iso) => {
    try { return format(new Date(iso), 'd MMM yyyy', { locale: bg }) } catch { return iso }
  }
  const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

  if (!influencer || (loading && !data)) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  const { orders = [], stats = {}, topProducts = [], commission = influencer?.commission || 0, bannerUrl = null } = data || {}
  const heroBanner = bannerUrl || influencer?.banner_url || null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          {influencer.avatar_url ? (
            <img src={influencer.avatar_url} alt={influencer.name}
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--accent-lt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0,
            }}>{influencer.name?.slice(0, 2).toUpperCase()}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{influencer.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              <strong>{influencer.promo_code}</strong>
              {' · '}
              {influencer.profile_url ? (
                <a href={influencer.profile_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                  {influencer.platform}
                </a>
              ) : influencer.platform}
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px',
            background: '#fef3c7', color: '#92400e', borderRadius: 20,
            border: '1px solid #fcd34d', whiteSpace: 'nowrap',
          }}>👁 Admin</span>
        </div>
      </header>

      <main className="main-container">
        {/* Hero — banner или gradient */}
        <div style={{
          borderRadius: 16, marginBottom: '1.5rem',
          color: '#fff', position: 'relative', overflow: 'hidden',
          minHeight: heroBanner ? 260 : 'auto',
          background: heroBanner
            ? `linear-gradient(180deg, rgba(0,0,0,.15) 30%, rgba(0,0,0,.7) 100%), url(${heroBanner}) center/cover`
            : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dk) 100%)',
        }}>
          {!heroBanner && (
            <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
          )}
          <div style={{ position: 'relative', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: heroBanner ? 260 : 'auto' }}>
            {/* Голяма профилна снимка горе вляво */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              {influencer.avatar_url ? (
                <img
                  src={influencer.avatar_url}
                  alt={influencer.name}
                  style={{
                    width: 96, height: 96, borderRadius: '50%',
                    objectFit: 'cover',
                    border: '4px solid rgba(255,255,255,.95)',
                    boxShadow: '0 4px 16px rgba(0,0,0,.25)',
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: 'rgba(255,255,255,.95)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, fontWeight: 700, color: 'var(--accent-dk)',
                  border: '4px solid rgba(255,255,255,.95)',
                  boxShadow: '0 4px 16px rgba(0,0,0,.25)',
                  flexShrink: 0,
                }}>{influencer.name?.slice(0, 2).toUpperCase()}</div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, opacity: .85, fontWeight: 500, textShadow: heroBanner ? '0 1px 4px rgba(0,0,0,.5)' : 'none' }}>
                  Здравей,
                </div>
                <div style={{
                  fontSize: 28, fontWeight: 700, lineHeight: 1.1,
                  textShadow: heroBanner ? '0 2px 8px rgba(0,0,0,.5)' : 'none',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {(influencer.name || '').split(/\s+/)[0]} 👋
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, opacity: .85, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Очаквана комисионна
            </div>
            <div className="hero-amount" style={{ fontSize: 38, fontWeight: 700, margin: '2px 0', textShadow: heroBanner ? '0 2px 8px rgba(0,0,0,.5)' : 'none' }}>
              {fmtEur(stats.totalCommission || 0)}
            </div>
            <div className="hero-sub" style={{ fontSize: 13, opacity: .95, textShadow: heroBanner ? '0 1px 4px rgba(0,0,0,.5)' : 'none' }}>
              {stats.totalOrders || 0} поръчки · {commission}% комисионна · клиентите спестиха <strong>{fmtEur(stats.totalSavings || 0)}</strong>
            </div>
          </div>
        </div>

        {/* Payouts — веднага под главната карта */}
        <PayoutWidget viewId={id} />

        {/* Share links (read-only за admin view) */}
        <ShareLinksWidget viewId={id} />

        {/* Leaderboard — както го вижда инфлуенсърът */}
        <InfluencerLeaderboard viewId={id} />

        {/* Date filters */}
        <div className="card" style={{ marginBottom: '1rem', padding: '14px' }}>
          <div className="filter-row">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>
              Период:
            </div>
            {shortcuts.map(sc => (
              <button key={sc.key} className={`chip ${activeShortcut === sc.key ? 'active' : ''}`} onClick={() => applyShortcut(sc)}>
                {sc.label}
              </button>
            ))}
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} />
            <button className={`chip ${activeShortcut === 'custom' ? 'active' : ''}`} onClick={applyCustom} disabled={!from && !to}>
              Приложи
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
          {[
            { label: 'Поръчки',     value: stats.totalOrders || 0,             sub: `с код ${influencer.promo_code}` },
            { label: 'Общ приход',  value: fmtEur(stats.totalRevenue || 0),    sub: 'платено от клиентите' },
            { label: 'Комисионна',  value: fmtEur(stats.totalCommission || 0), sub: `${commission}% от пълната цена` },
            { label: 'Ср. поръчка', value: fmtEur(stats.avgOrderValue || 0),   sub: 'средна стойност' },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-value">{m.value}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Top products */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Топ продукти (с отстъпка)
          </div>
          {topProducts.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Няма данни</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {topProducts.map((p, i) => (
              <div key={i} style={{ background: 'var(--bg)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.title} style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 8, objectFit: 'cover', background: '#fff' }} />
                ) : (
                  <div style={{
                    width: '100%', aspectRatio: '1 / 1', borderRadius: 8,
                    background: 'var(--accent-lt)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700, color: 'var(--accent-dk)',
                  }}>{p.title?.slice(0, 2).toUpperCase()}</div>
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
        <div className="card table-cards">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Поръчки (анонимизирани — без лични данни)
          </div>
          <table style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th>№</th>
                <th>Дата</th>
                <th>Продукти</th>
                <th title="Сума, която клиентът е платил след отстъпката">Обща сума</th>
                <th title="Пълна цена на продуктите с приложен промокод">Продукти с код</th>
                <th title="Колко клиентът е спестил чрез промокода">Отстъпка за клиента</th>
                <th>Доставка</th>
                <th>Комисионна</th>
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
                const comm      = fullPrice * (commission / 100)

                return (
                  <tr key={order.id}>
                    <td data-label="№" style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{order.shopify_order_id}</td>
                    <td data-label="Дата" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(order.created_at_shopify)}</td>
                    <td data-label="Продукти">
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
                    <td data-label="Обща сума" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(paid)}</td>
                    <td data-label="Продукти с код" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(fullPrice)}</td>
                    <td data-label="Отстъпка" style={{ color: '#16a34a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {savings > 0 ? `−${fmtEur(savings)}` : '—'}
                    </td>
                    <td data-label="Доставка" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {shipping > 0 ? fmtEur(shipping) : '—'}
                    </td>
                    <td data-label="Комисионна" style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtEur(comm)}
                    </td>
                    <td data-label="Статус">
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
