'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'
import { motion, useReducedMotion } from 'framer-motion'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Clock, TrendingUp, Crown, MousePointerClick, ShoppingCart, Receipt, PiggyBank, Home, Link2, Wallet, Trophy, Gift, LogOut, Sun, Moon, Menu, X } from 'lucide-react'
import InfluencerLeaderboard from './components/InfluencerLeaderboard'
import PayoutWidget from './components/PayoutWidget'
import ShareLinksWidget from './components/ShareLinksWidget'
import ProductRequestsWidget from './components/ProductRequestsWidget'
import MyProductRequestsWidget from './components/MyProductRequestsWidget'

const fmtCurr = (n) => new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))

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

/* ───────────────── Sidebar / Mobile tab bar nav ───────────────── */
const NAV = [
  { id: 'top',       label: 'Преглед',  Icon: Home },
  { id: 'links',     label: 'Линкове',  Icon: Link2 },
  { id: 'payout',    label: 'Изплащане',Icon: Wallet },
  { id: 'requests',  label: 'Заявки',   Icon: Gift },
  { id: 'leaderboard',label:'Класация', Icon: Trophy },
]
function scrollToAnchor(id) {
  if (id === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Sidebar({ active, userInfo, branding, onLogout, theme, onToggleTheme }) {
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  return (
    <aside className="hidden lg:flex w-[240px] shrink-0 flex-col bg-[#0F1218] border-r border-white/5 sticky top-0 h-screen">
      <div className="px-6 pt-6 pb-3 flex items-center gap-2">
        {branding.logo_url ? (
          <img src={branding.logo_url} alt="" className="h-7" />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400" aria-hidden />
        )}
        <div className="bg-gradient-to-r from-emerald-300 to-lime-300 bg-clip-text text-transparent font-bold text-lg tracking-tight">RealFood</div>
      </div>

      <nav className="px-3 mt-3 flex flex-col gap-1" aria-label="Главна навигация">
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => scrollToAnchor(item.id)}
            className={`relative group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              active === item.id
                ? 'bg-emerald-400/10 text-emerald-300'
                : 'text-[#8A93A6] hover:text-[#F5F7FA] hover:bg-white/[.04]'
            }`}
          >
            {active === item.id && (
              <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-gradient-to-b from-emerald-400 to-lime-400" aria-hidden />
            )}
            <item.Icon size={18} aria-hidden />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto p-3 flex flex-col gap-2">
        <button onClick={onToggleTheme} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#8A93A6] hover:text-[#F5F7FA] hover:bg-white/[.04]">
          {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          {theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}
        </button>
        <button onClick={onLogout} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#8A93A6] hover:text-rose-300 hover:bg-rose-500/10">
          <LogOut size={16} aria-hidden /> Изход
        </button>

        <div className="mt-2 rounded-2xl bg-[#14171F] ring-1 ring-white/[.06] p-3 flex items-center gap-3">
          {userInfo.avatarUrl ? (
            <img src={userInfo.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center text-[#0B0D12] font-bold text-sm" aria-hidden>
              {(userInfo.name || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate text-[#F5F7FA]">{firstName || userInfo.name}</div>
            <div className="text-[11px] text-amber-300 inline-flex items-center gap-1">
              <Crown size={11} aria-hidden /> {userInfo.promoCode}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function MobileTabBar({ active }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 h-16 bg-[#0F1218]/90 backdrop-blur-xl border-t border-white/5 grid grid-cols-5"
      aria-label="Мобилна навигация"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV.map(item => (
        <button key={item.id} onClick={() => scrollToAnchor(item.id)} aria-label={item.label}
          className="relative flex flex-col items-center justify-center gap-1 text-[#8A93A6]">
          <item.Icon size={20} aria-hidden className={active === item.id ? 'text-emerald-300' : ''} />
          {active === item.id && <span className="h-1 w-1 rounded-full bg-emerald-300" aria-hidden />}
        </button>
      ))}
    </nav>
  )
}

/* ───────────────── Hero earnings card ───────────────── */
function FintechHero({ userInfo, currentMonth, countUpCommission, avatarUrl }) {
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  const monthLabel = format(new Date(), 'LLLL', { locale: bg })
  return (
    <motion.section
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-3xl p-7 md:p-8 text-white"
      style={{
        background: 'linear-gradient(135deg, #0F2A24 0%, #163A4A 50%, #0F2438 100%)',
        boxShadow: '0 20px 60px -20px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)',
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" aria-hidden>
        <filter id="hn"><feTurbulence baseFrequency="0.9" numOctaves="2" /></filter>
        <rect width="100%" height="100%" filter="url(#hn)" />
      </svg>

      <div className="relative">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[.18em] text-white/60">Очаквана комисионна за {monthLabel}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/[.08] px-3 py-1 text-xs text-white/80 ring-1 ring-white/[.12]">
              <Clock size={13} aria-hidden /> {getTimeGreeting()} {firstName}
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div className="hidden sm:block">
              <div className="text-sm font-medium">{userInfo.name}</div>
              <div className="text-xs text-white/60">{userInfo.promoCode ? `@${userInfo.promoCode.toLowerCase()}` : '—'}</div>
            </div>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/30" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center text-[#0B0D12] font-bold ring-2 ring-white/30" aria-hidden>
                {(userInfo.name || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div
            className="text-5xl md:text-6xl font-semibold tracking-tight tabular-nums bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)' }}
          >
            {fmtCurr(countUpCommission)}
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25 px-2.5 py-1 text-xs font-semibold tabular-nums">
              <TrendingUp size={13} aria-hidden /> {currentMonth.orders || 0} {currentMonth.orders === 1 ? 'поръчка' : 'поръчки'} този месец
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.08] ring-1 ring-white/[.12] text-white/80 px-2.5 py-1 text-xs tabular-nums">
              {userInfo.commission}% комисионна · клиентите спестиха {fmtCurr(currentMonth.savings || 0)}
            </span>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

/* ───────────────── Payout progress ring ───────────────── */
function PayoutRing({ balance, onScrollToPayout }) {
  const reduce = useReducedMotion()
  const available = Number(balance?.available || 0)
  const minPayout = Number(balance?.minPayout || 100)
  const pct = Math.min(100, Math.max(0, Math.round((available / minPayout) * 100)))
  const radius = 72
  const circ = 2 * Math.PI * radius
  const ready = available >= minPayout

  return (
    <motion.section whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
      className="rounded-3xl bg-[#14171F] p-6 ring-1 ring-white/[.06] flex flex-col items-center"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)' }}
    >
      <div className="w-full text-[11px] uppercase tracking-[.18em] text-[#8A93A6]">Налично за теглене</div>
      <div className="relative my-4 grid place-items-center" style={{ width: 170, height: 170 }}>
        <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#A3E635" />
            </linearGradient>
          </defs>
          <circle cx="85" cy="85" r={radius} stroke="rgba(255,255,255,.08)" strokeWidth="14" fill="none" />
          <motion.circle
            cx="85" cy="85" r={radius} stroke="url(#ringG)" strokeWidth="14" fill="none" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (circ * pct) / 100 }}
            transition={{ duration: reduce ? 0 : 1.4, ease: [0.21, 1.02, 0.73, 1] }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <div className="text-3xl font-semibold tabular-nums text-[#F5F7FA]">{pct}%</div>
          <div className="mt-1 text-[10px] tabular-nums text-[#8A93A6]">{fmtCurr(available)} / {fmtCurr(minPayout)}</div>
        </div>
      </div>
      <button
        onClick={onScrollToPayout}
        disabled={!ready}
        className={`w-full rounded-2xl text-[#0B0D12] font-semibold py-2.5 transition ${
          ready
            ? 'bg-gradient-to-r from-emerald-400 to-lime-400 hover:brightness-110'
            : 'bg-gradient-to-r from-emerald-400 to-lime-400 opacity-40 cursor-not-allowed'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400`}
      >
        Заяви изплащане
      </button>
      <p className="mt-2 text-center text-[11px] text-[#8A93A6]">
        {ready ? 'Достигна прага — можеш да заявиш' : `Останаха ${fmtCurr(Math.max(0, minPayout - available))}`}
      </p>
    </motion.section>
  )
}

/* ───────────────── KPI card ───────────────── */
function KpiCard({ label, value, Icon, color, sparkData, accent }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
      className="rounded-2xl bg-[#14171F] p-5 ring-1 ring-white/[.06]"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)' }}
    >
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>
        <Icon size={18} aria-hidden />
      </div>
      <div className="mt-4 text-[10px] uppercase tracking-[.18em] text-[#8A93A6]">{label}</div>
      <div className="text-2xl font-semibold tabular-nums text-[#F5F7FA]">{value}</div>
      {sparkData && sparkData.length > 0 && (
        <div className="mt-3 -mx-2 h-[44px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`s-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="y" stroke={accent} strokeWidth={1.5} fill={`url(#s-${label})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}

/* ───────────────── Earnings area chart (30d derived from orders) ───────────────── */
function EarningsChart({ orders, commissionRate }) {
  const data = useMemo(() => {
    const now = new Date()
    const start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0,0,0,0)
    const map = {}
    eachDayOfInterval({ start, end: now }).forEach(d => {
      map[format(d, 'yyyy-MM-dd')] = { d: format(d, 'd MMM', { locale: bg }), v: 0 }
    })
    ;(orders || []).forEach(o => {
      if (!o.created_at_shopify) return
      const key = (typeof o.created_at_shopify === 'string' ? o.created_at_shopify : '').slice(0, 10)
      if (map[key]) {
        const fullPrice = parseFloat(o.commissionable_revenue || 0)
        map[key].v += fullPrice * (Number(commissionRate || 0) / 100)
      }
    })
    return Object.values(map).map(p => ({ ...p, v: Math.round(p.v * 100) / 100 }))
  }, [orders, commissionRate])

  return (
    <motion.section whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
      className="rounded-3xl bg-[#14171F] p-6 ring-1 ring-white/[.06]"
      style={{ boxShadow: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)' }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-[#F5F7FA]">Очакван приход</h2>
          <div className="text-xs text-[#8A93A6]">Дневна комисионна за последните 30 дни</div>
        </div>
      </div>
      <div className="mt-4 h-[240px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="earnArea2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="d" stroke="#8A93A6" tickLine={false} axisLine={false} fontSize={10} interval={4} />
            <YAxis stroke="#8A93A6" tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => `€${v}`} width={42} />
            <Tooltip
              cursor={{ stroke: '#34D39955', strokeDasharray: '3 3' }}
              contentStyle={{ background: '#14171F', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12 }}
              labelStyle={{ color: '#8A93A6', fontSize: 11 }}
              formatter={(v) => [fmtCurr(v), '']}
            />
            <Area type="monotone" dataKey="v" stroke="#34D399" strokeWidth={2.5} fill="url(#earnArea2)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  )
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
  const targetCommission = Number(data?.currentMonth?.commission || 0)
  const countUpCommission = useCountUp(targetCommission)

  // Payout balance fetch (за progress ring-а — отделно от PayoutWidget)
  const [payoutBalance, setPayoutBalance] = useState(null)
  useEffect(() => {
    fetch('/api/dashboard/payouts')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setPayoutBalance(d.balance))
      .catch(() => {})
  }, [])

  // Mobile drawer state
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (loading && !data) return (
    <div className="dashboard-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  const { orders = [], stats = {}, topProducts = [], bannerUrl = null, avatarUrl = null, currentMonth = {} } = data || {}
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  const monthLabel = format(new Date(), 'LLLL', { locale: bg })

  // KPI sparkline data — derived от orders за последните 30 дни
  const last30 = (data?.orders || []).filter(o => {
    if (!o.created_at_shopify) return false
    const d = new Date(o.created_at_shopify)
    return Date.now() - d.getTime() < 30 * 24 * 60 * 60 * 1000
  })

  return (
    <div className={`dashboard-shell ${theme === 'dark' ? 'theme-dark' : ''}`} style={{ minHeight: '100vh' }}>
      <div className={theme === 'dark' ? 'flex' : ''}>
        {/* Sidebar — само в DARK режим */}
        {theme === 'dark' && (
          <Sidebar
            active="top"
            userInfo={{ ...userInfo, avatarUrl: data?.avatarUrl }}
            branding={branding}
            onLogout={logout}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}

        <div className={theme === 'dark' ? 'flex-1 min-w-0' : ''}>
          {/* Mobile top bar — само в dark режим (light има обикновен header) */}
          {theme === 'dark' && (
            <div className="lg:hidden sticky top-0 z-30 bg-[#0F1218]/90 backdrop-blur-xl border-b border-white/5 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt="" className="h-7" />
                ) : (
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-lime-400" aria-hidden />
                )}
                <span className="bg-gradient-to-r from-emerald-300 to-lime-300 bg-clip-text text-transparent font-bold tracking-tight">RealFood</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={toggleTheme} aria-label="Светъл режим" className="p-2 rounded-full text-white/70 hover:text-white">
                  <Sun size={18} />
                </button>
                <button onClick={logout} aria-label="Изход" className="p-2 rounded-full text-white/70 hover:text-rose-300">
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Light-режим header — оригиналният magazine стил */}
          {theme === 'light' && (
            <header className="header-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt="Logo" style={{ height: 32, maxWidth: 120, objectFit: 'contain', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-lt)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: 'var(--accent-dk)', flexShrink: 0 }}>
                    {userInfo.name?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                )}
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userInfo.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Промокод: <strong>{userInfo.promoCode}</strong></div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={toggleTheme} title="Тъмен режим" aria-label="Тъмен режим" style={{ padding: '6px 10px' }}>
                  <Moon size={16} />
                </button>
                <button className="btn btn-sm btn-ghost" onClick={logout}>Изход</button>
              </div>
            </header>
          )}

          <main id="top" className="main-container pb-24 lg:pb-12">
            {/* DARK-режим: премиум fintech блок отгоре */}
            {theme === 'dark' && (
              <>
                <div className="grid grid-cols-12 gap-4 md:gap-6 mb-6">
                  <div className="col-span-12 lg:col-span-8">
                    <FintechHero
                      userInfo={userInfo}
                      currentMonth={currentMonth}
                      countUpCommission={countUpCommission}
                      avatarUrl={avatarUrl}
                    />
                  </div>
                  <div className="col-span-12 lg:col-span-4">
                    <PayoutRing balance={payoutBalance} onScrollToPayout={() => scrollToAnchor('payout')} />
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
                  <KpiCard label="Кликове · 90д" value={String(stats.totalClicks || 0)} Icon={MousePointerClick} color="bg-sky-500/15 text-sky-300" accent="#60A5FA" sparkData={[]} />
                  <KpiCard label="Поръчки · общо" value={String(stats.totalOrders || 0)} Icon={ShoppingCart} color="bg-emerald-500/15 text-emerald-300" accent="#34D399" sparkData={[]} />
                  <KpiCard label="Средна поръчка" value={fmtCurr(stats.avgOrderValue || 0)} Icon={Receipt} color="bg-amber-500/15 text-amber-300" accent="#FCD34D" sparkData={[]} />
                  <KpiCard label="Спестено · клиенти" value={fmtCurr(currentMonth.savings || 0)} Icon={PiggyBank} color="bg-violet-500/15 text-violet-300" accent="#A78BFA" sparkData={[]} />
                </div>

                <div className="mb-6">
                  <EarningsChart orders={data?.orders} commissionRate={userInfo.commission} />
                </div>
              </>
            )}

            {/* Деактивиран акаунт */}
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
              </>
            )}

            {/* Активни инфлуенсъри — пълен изглед */}
            {userInfo.active !== false && (<>
        {/* Payouts — веднага под главната карта */}
        <div id="payout"><PayoutWidget /></div>

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
        <div id="links"><ShareLinksWidget /></div>

        {/* Product requests */}
        <div id="requests"><ProductRequestsWidget /></div>

        {/* История на заявките за продукти */}
        <MyProductRequestsWidget />

        {/* Leaderboard */}
        <div id="leaderboard"><InfluencerLeaderboard /></div>

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
      </div>

      {theme === 'dark' && <MobileTabBar active="top" />}
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
