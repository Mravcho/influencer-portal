'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { bg } from 'date-fns/locale'
import InfluencerLeaderboard from './components/InfluencerLeaderboard'
import PayoutWidget from './components/PayoutWidget'
import ShareLinksWidget from './components/ShareLinksWidget'
import ProductRequestsWidget from './components/ProductRequestsWidget'
import MyProductRequestsWidget from './components/MyProductRequestsWidget'

function ymd(d) {
  return format(d, 'yyyy-MM-dd')
}

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Добро утро,'
  if (h >= 12 && h < 18) return 'Добър ден,'
  if (h >= 18 && h < 23) return 'Добър вечер,'
  return 'Здравей,'
}

// Count-up hook за hero amount (ease-out cubic, ~900ms)
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') { setValue(target); return }
    // Reduced motion → пропускаме анимацията
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) { setValue(target); return }

    let raf, start
    const tick = (now) => {
      if (!start) start = now
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(target * eased)
      if (progress < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
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
  const [userInfo, setUserInfo] = useState({ name: '', promoCode: '', commission: 0, active: true })
  const [branding, setBranding] = useState({ logo_url: null })

  const [activeShortcut, setActiveShortcut] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  // Тема: 'light' (default) или 'dark'. Запомня се в localStorage per-инфлуенсър.
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rf-portal-theme')
      if (saved === 'dark' || saved === 'light') setTheme(saved)
    } catch {}
  }, [])
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem('rf-portal-theme', next) } catch {}
  }

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

  // Body фонът се синхронизира със shell темата (light fallback или dark)
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = theme === 'dark' ? '#0B0D12' : ''
    return () => { document.body.style.backgroundColor = prev }
  }, [theme])

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

  // ВАЖНО: hooks трябва да се извикват в един и същ ред на всеки render.
  // Затова useCountUp е ТУК (преди early return-а), а не след него.
  const targetCommission = Number(data?.currentMonth?.commission || 0)
  const countUpCommission = useCountUp(targetCommission)

  if (loading && !data) return (
    <div className="dashboard-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  const { orders = [], stats = {}, topProducts = [], bannerUrl = null, avatarUrl = null, currentMonth = {} } = data || {}
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  const monthLabel = format(new Date(), 'LLLL', { locale: bg })

  return (
    <div className={`dashboard-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
      {/* Header */}
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="Logo" style={{ height: 32, maxWidth: 120, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--accent-lt)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0,
            }}>
              {userInfo.name?.slice(0, 2).toUpperCase() || '??'}
            </div>
          )}
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userInfo.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Промокод: <strong>{userInfo.promoCode}</strong></div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}
            aria-label={theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}
            style={{ padding: '6px 10px' }}
          >
            {theme === 'dark' ? (
              /* Слънце */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              /* Луна */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Изход</button>
        </div>
      </header>

      <main className="main-container">
        {/* Hero — magazine-cover */}
        <div className={`hero-card ${bannerUrl ? 'has-banner' : ''}`}
          style={bannerUrl ? {
            backgroundImage: `linear-gradient(135deg, rgba(15, 110, 86, .85) 0%, rgba(13, 77, 63, .92) 60%, rgba(8, 35, 28, .95) 100%), url(${bannerUrl})`,
          } : undefined}
        >
          {/* Декоративни blob-ове за gradient версия */}
          {!bannerUrl && (
            <>
              <div className="hero-blob hero-blob-1" />
              <div className="hero-blob hero-blob-2" />
              <div className="hero-blob hero-blob-3" />
            </>
          )}

          <div className="hero-inner">
            {/* Горен ред: greeting вляво, avatar вдясно */}
            <div className="hero-top">
              <div className="hero-greeting">
                <div className="hero-time-greet">{getTimeGreeting()}</div>
                <div className="hero-name">{firstName || userInfo.name}</div>
                <div className="hero-date">{format(new Date(), 'EEEE, d MMMM', { locale: bg })}</div>
              </div>

              <div className="hero-avatar-wrap">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={userInfo.name} className="hero-avatar" />
                ) : (
                  <div className="hero-avatar hero-avatar-placeholder">
                    {userInfo.name?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                )}
              </div>
            </div>

            {/* Главно число */}
            <div className="hero-amount-section">
              <div className="hero-amount-label">Очаквана комисионна за {monthLabel}</div>
              <div className="hero-amount">{fmtEur(countUpCommission)}</div>
              <div className="hero-meta-row">
                {targetCommission >= 100 ? (
                  <span className="pill-glass">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Праг за теглене постигнат
                  </span>
                ) : (
                  <span className="pill-glass">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Още {fmtEur(Math.max(0, 100 - targetCommission))} до прага за теглене
                  </span>
                )}
              </div>
            </div>

            {/* 3 stat pill-а */}
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-icon">📦</div>
                <div className="hero-stat-body">
                  <div className="hero-stat-value">{currentMonth.orders || 0}</div>
                  <div className="hero-stat-label">{currentMonth.orders === 1 ? 'поръчка' : 'поръчки'}</div>
                </div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon">%</div>
                <div className="hero-stat-body">
                  <div className="hero-stat-value">{userInfo.commission}%</div>
                  <div className="hero-stat-label">комисионна</div>
                </div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-icon">💚</div>
                <div className="hero-stat-body">
                  <div className="hero-stat-value">{fmtEur(currentMonth.savings || 0).replace(' €', '')}</div>
                  <div className="hero-stat-label">спестено от клиентите</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Деактивиран акаунт — оскъден изглед, само досегашна статистика */}
        {userInfo.active === false && (
          <>
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12,
              padding: '14px 18px', marginBottom: '1.5rem',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 22 }}>⏸</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#78350f' }}>
                  Акаунтът ти е временно деактивиран
                </div>
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
                  Можеш да видиш досегашната си статистика. За реактивация — свържи се с екипа на RealFood.
                </div>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
              <div className="metric">
                <div className="metric-label">Общо поръчки</div>
                <div className="metric-value">{stats.totalOrders || 0}</div>
                <div className="metric-sub">с код {userInfo.promoCode}</div>
              </div>
              <div className="metric">
                <div className="metric-label">Натрупана комисионна</div>
                <div className="metric-value">{fmtEur(stats.totalCommission || 0)}</div>
                <div className="metric-sub">{userInfo.commission}% от пълната цена</div>
              </div>
            </div>
          </>
        )}

        {/* Активни инфлуенсъри — пълен изглед */}
        {userInfo.active !== false && (<>
        {/* Payouts — веднага под главната карта */}
        <PayoutWidget />

        {/* Date filters */}
        <div className="card" style={{ marginBottom: '1rem', padding: '14px' }}>
          <div className="filter-row">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>
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
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px' }}
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
        <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
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

        {/* Share links */}
        <ShareLinksWidget />

        {/* Product requests */}
        <ProductRequestsWidget />

        {/* История на заявките за продукти */}
        <MyProductRequestsWidget />

        {/* Leaderboard */}
        <InfluencerLeaderboard />

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
                <th title="Доставка (не влиза в комисионната)">Доставка</th>
                <th title={`${userInfo.commission}% от пълната цена на продуктите с код`}>Комисионна</th>
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
        </>)}
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
