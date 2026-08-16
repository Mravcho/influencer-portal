'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'
import { motion, useReducedMotion } from 'framer-motion'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Clock, TrendingUp, Crown, MousePointerClick, ShoppingCart, Receipt, PiggyBank, Home, Link2, Wallet, Trophy, Gift, LogOut, Sun, Moon, Menu, X, Megaphone, MessageCircle, FileText } from 'lucide-react'
import InfluencerLeaderboard from './components/InfluencerLeaderboard'
import PayoutWidget from './components/PayoutWidget'
import ShareLinksWidget from './components/ShareLinksWidget'
import ProductRequestsWidget from './components/ProductRequestsWidget'
import CampaignCard from './components/CampaignCard'
import FloatingChat from './components/FloatingChat'
import MyProductRequestsWidget from './components/MyProductRequestsWidget'

const fmtCurr = (n) => new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))

// Дата + час на приемане на общите условия (в локалното време на браузъра).
const fmtDateTime = (iso) => {
  if (!iso) return null
  try { return format(new Date(iso), "d MMMM yyyy 'г.', HH:mm", { locale: bg }) } catch { return iso }
}

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

/* ───────────────── Theme tokens (light + dark) ───────────────── */
const TOKENS = {
  light: {
    sidebarBg:   '#FAFAFC',
    sidebarBorder: '#E5E5EA',
    cardBg:      '#FFFFFF',
    cardBorder:  '#E5E5EA',
    text:        '#1D1D1F',
    muted:       '#6E6E73',
    iconMuted:   '#86868B',
    activeBg:    'rgba(52, 211, 153, 0.12)',
    activeText:  '#0F6E56',
    hoverBg:     'rgba(0, 0, 0, 0.04)',
    hoverText:   '#1D1D1F',
    barBg:       'rgba(255,255,255,0.92)',
    chartGrid:   'rgba(0,0,0,0.06)',
    tooltipBg:   '#FFFFFF',
    tooltipBorder: '#E5E5EA',
    ringTrack:   'rgba(0,0,0,0.08)',
  },
  dark: {
    sidebarBg:   '#0E1118',
    sidebarBorder: 'rgba(255,255,255,0.06)',
    cardBg:      '#14171F',
    cardBorder:  'rgba(255,255,255,0.06)',
    text:        '#F5F7FA',
    muted:       '#A1A8B8',
    iconMuted:   '#A1A8B8',
    activeBg:    'rgba(52, 211, 153, 0.12)',
    activeText:  '#A3E635',
    hoverBg:     'rgba(255,255,255,0.05)',
    hoverText:   '#F5F7FA',
    barBg:       'rgba(14, 17, 24, 0.92)',
    chartGrid:   'rgba(255,255,255,0.06)',
    tooltipBg:   '#14171F',
    tooltipBorder: 'rgba(255,255,255,0.08)',
    ringTrack:   'rgba(255,255,255,0.08)',
  },
}

/* ───────────────── Sidebar / Mobile tab bar nav ───────────────── */
const NAV = [
  { id: 'top',       label: 'Преглед',  Icon: Home },
  { id: 'campaign',  label: 'Кампания', Icon: Megaphone },
  { id: 'links',     label: 'Линкове',  Icon: Link2 },
  { id: 'payout',    label: 'Изплащане',Icon: Wallet },
  { id: 'requests',  label: 'Заявки',   Icon: Gift },
  { id: 'chat',      label: 'Чат',      Icon: MessageCircle },
  { id: 'leaderboard',label:'Класация', Icon: Trophy },
]
// Долната мобилна лента е с 5 таба (без „Кампания" и „Чат" — чатът е плаващо
// балонче, винаги видимо). Кампанията е достъпна от картата най-горе + менюто.
const MOBILE_NAV = NAV.filter(n => !['campaign', 'chat'].includes(n.id))
function scrollToAnchor(id) {
  if (id === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function SidebarNavItem({ item, active, onClick, t }) {
  const isActive = active === item.id
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        padding: '11px 14px',
        fontSize: 14,
        fontWeight: 500,
        textAlign: 'left',
        width: '100%',
        cursor: 'pointer',
        transition: 'all .15s ease',
        background: isActive ? t.activeBg : 'transparent',
        color: isActive ? t.activeText : t.iconMuted,
        border: 'none',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.background = t.hoverBg
          e.currentTarget.style.color = t.hoverText
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = t.iconMuted
        }
      }}
    >
      {isActive && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
            background: 'linear-gradient(180deg, #34D399 0%, #A3E635 100%)',
          }}
          aria-hidden
        />
      )}
      <item.Icon size={18} aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
    </button>
  )
}

function Sidebar({ active, userInfo, branding, onLogout, theme, onToggleTheme }) {
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  const t = TOKENS[theme] || TOKENS.dark
  return (
    <aside
      className="hidden lg:flex"
      style={{
        width: 260,
        flexShrink: 0,
        flexDirection: 'column',
        background: t.sidebarBg,
        borderRight: `1px solid ${t.sidebarBorder}`,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ padding: '24px 22px 12px', display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
        {branding.logo_url ? (
          // Качено лого от admin — показва се само то, без wordmark
          <img src={branding.logo_url} alt="RealFood" style={{ height: 32, maxWidth: 180, objectFit: 'contain' }} />
        ) : (
          // Fallback: gradient + wordmark
          <>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
              boxShadow: '0 0 20px rgba(52,211,153,.3)',
            }} aria-hidden />
            <div style={{
              fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>RealFood</div>
          </>
        )}
      </div>

      <nav style={{ padding: '8px 10px', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }} aria-label="Главна навигация">
        {NAV.map(item => (
          <SidebarNavItem key={item.id} item={item} active={active} onClick={() => item.id === 'chat' ? window.dispatchEvent(new Event('rf-open-chat')) : scrollToAnchor(item.id)} t={t} />
        ))}
      </nav>

      <div style={{ marginTop: 'auto', padding: '10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <SidebarNavItem
          item={{
            id: '_theme',
            label: theme === 'dark' ? 'Светъл режим' : 'Тъмен режим',
            Icon: theme === 'dark' ? Sun : Moon,
          }}
          active={null}
          onClick={onToggleTheme}
          t={t}
        />
        {userInfo.termsUrl && (
          <>
            <SidebarNavItem
              item={{ id: '_terms', label: 'Общи условия', Icon: FileText }}
              active={null}
              onClick={() => window.open('/terms', '_blank', 'noopener,noreferrer')}
              t={t}
            />
            {userInfo.termsAcceptedAt && (
              <div style={{ padding: '0 14px 4px 44px', fontSize: 10.5, lineHeight: 1.4, color: t.iconMuted }}>
                Приети на {fmtDateTime(userInfo.termsAcceptedAt)}
              </div>
            )}
          </>
        )}
        <SidebarNavItem
          item={{ id: '_logout', label: 'Изход', Icon: LogOut }}
          active={null}
          onClick={onLogout}
          t={t}
        />

        <div style={{
          marginTop: 8,
          borderRadius: 16,
          background: t.cardBg,
          border: `1px solid ${t.cardBorder}`,
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {userInfo.avatarUrl ? (
            <img src={userInfo.avatarUrl} alt="" style={{ height: 36, width: 36, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              height: 36, width: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FCD34D 0%, #FB923C 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#0B0D12', fontWeight: 700, fontSize: 13,
            }} aria-hidden>
              {(userInfo.name || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {firstName || userInfo.name}
            </div>
            <div style={{ fontSize: 11, color: theme === 'dark' ? '#FCD34D' : '#B45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Crown size={11} aria-hidden /> {userInfo.promoCode}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function MobileTabBar({ active, theme }) {
  const t = TOKENS[theme] || TOKENS.dark
  return (
    <nav
      className="lg:hidden"
      aria-label="Мобилна навигация"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: t.barBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${t.sidebarBorder}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingTop: 6,
      }}
    >
      {MOBILE_NAV.map(item => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            onClick={() => scrollToAnchor(item.id)}
            aria-label={item.label}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              padding: '8px 4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? t.activeText : t.iconMuted,
              fontFamily: 'inherit',
              fontSize: 10,
              fontWeight: isActive ? 700 : 500,
              minHeight: 56,
            }}
          >
            <item.Icon size={20} aria-hidden />
            <span style={{ letterSpacing: '0.02em' }}>{item.label}</span>
            {isActive && (
              <span style={{
                position: 'absolute',
                top: 0,
                width: 24,
                height: 3,
                borderRadius: 3,
                background: 'linear-gradient(90deg, #34D399 0%, #A3E635 100%)',
              }} aria-hidden />
            )}
          </button>
        )
      })}
    </nav>
  )
}

/* ───────────────── Hero earnings card ───────────────── */
function FintechHero({ userInfo, currentMonth, countUpCommission, avatarUrl, theme }) {
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  const monthLabel = format(new Date(), 'LLLL', { locale: bg })
  // Light: brand-green gradient (нашата традиционна). Dark: navy fintech.
  const heroBg = theme === 'dark'
    ? 'linear-gradient(135deg, #0F2A24 0%, #163A4A 50%, #0F2438 100%)'
    : 'linear-gradient(135deg, #1D9E75 0%, #0F6E56 55%, #0d4d3f 100%)'
  return (
    <motion.section
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-3xl p-7 md:p-8 text-white"
      style={{
        background: heroBg,
        boxShadow: theme === 'dark'
          ? '0 20px 60px -20px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)'
          : '0 10px 40px -10px rgba(15, 110, 86, 0.45), inset 0 0 0 1px rgba(255,255,255,.12)',
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
function PayoutRing({ balance, onScrollToPayout, theme }) {
  const t = TOKENS[theme] || TOKENS.dark
  const reduce = useReducedMotion()
  const available = Number(balance?.available || 0)
  const minPayout = Number(balance?.minPayout || 100)
  const pct = Math.min(100, Math.max(0, Math.round((available / minPayout) * 100)))
  const radius = 72
  const circ = 2 * Math.PI * radius
  const ready = available >= minPayout

  return (
    <motion.section whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
      style={{
        borderRadius: 24,
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: theme === 'dark'
          ? '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)'
          : '0 1px 3px rgba(0,0,0,.04), 0 8px 24px -8px rgba(0,0,0,.08)',
      }}
    >
      <div style={{ width: '100%', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.18em', color: t.muted }}>
        Налично за теглене
      </div>
      <div className="relative my-4 grid place-items-center" style={{ width: 170, height: 170 }}>
        <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#A3E635" />
            </linearGradient>
          </defs>
          <circle cx="85" cy="85" r={radius} stroke={t.ringTrack} strokeWidth="14" fill="none" />
          <motion.circle
            cx="85" cy="85" r={radius} stroke="url(#ringG)" strokeWidth="14" fill="none" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (circ * pct) / 100 }}
            transition={{ duration: reduce ? 0 : 1.4, ease: [0.21, 1.02, 0.73, 1] }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <div style={{ fontSize: 30, fontWeight: 600, color: t.text, fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
          <div style={{ marginTop: 4, fontSize: 10, color: t.muted, fontVariantNumeric: 'tabular-nums' }}>
            {fmtCurr(available)} / {fmtCurr(minPayout)}
          </div>
        </div>
      </div>
      <button
        onClick={onScrollToPayout}
        disabled={!ready}
        style={{
          width: '100%',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
          color: '#0B0D12',
          fontWeight: 700,
          padding: '10px 16px',
          border: 'none',
          cursor: ready ? 'pointer' : 'not-allowed',
          opacity: ready ? 1 : 0.4,
          fontFamily: 'inherit',
        }}
      >
        Заяви изплащане
      </button>
      <p style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: t.muted }}>
        {ready ? 'Достигна прага — можеш да заявиш' : `Останаха ${fmtCurr(Math.max(0, minPayout - available))}`}
      </p>
    </motion.section>
  )
}

/* ───────────────── KPI card ───────────────── */
function KpiCard({ label, value, Icon, accent, sparkData, theme }) {
  const t = TOKENS[theme] || TOKENS.dark
  // По-наситен icon tile в light режим (тъмен текст върху pastel), по-светъл в dark
  const iconBg  = theme === 'dark' ? `${accent}26` : `${accent}1F`
  const iconClr = accent
  return (
    <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}
      style={{
        borderRadius: 20,
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        padding: 18,
        boxShadow: theme === 'dark'
          ? '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)'
          : '0 1px 2px rgba(0,0,0,.04), 0 12px 28px -12px rgba(0,0,0,.12)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle accent corner glow — само в dark mode (на бяло гледа цапано) */}
      {theme === 'dark' && (
        <div style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: `${accent}10`,
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }} aria-hidden />
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          display: 'grid', placeItems: 'center',
          height: 40, width: 40, borderRadius: 12,
          background: iconBg,
          color: iconClr,
        }}>
          <Icon size={18} aria-hidden />
        </div>
      </div>

      <div style={{ position: 'relative', marginTop: 14, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.18em', color: t.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ position: 'relative', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: t.text, marginTop: 2 }}>{value}</div>
      {sparkData && sparkData.length > 0 && (
        <div style={{ position: 'relative', marginTop: 14, marginLeft: -8, marginRight: -8, height: 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              {/* В light режим: само линията, без gradient fill (по-чисто).
                  В dark: запазваме gradient за повече дълбочина. */}
              {theme === 'dark' && (
                <defs>
                  <linearGradient id={`s-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
              )}
              <Area
                type="monotone"
                dataKey="y"
                stroke={accent}
                strokeWidth={2}
                fill={theme === 'dark' ? `url(#s-${label})` : 'none'}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}

/* ───────────────── Earnings area chart (30d derived from orders) ───────────────── */
function EarningsChart({ orders, commissionRate, theme }) {
  const t = TOKENS[theme] || TOKENS.dark
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
      style={{
        borderRadius: 24,
        background: t.cardBg,
        border: `1px solid ${t.cardBorder}`,
        padding: 24,
        boxShadow: theme === 'dark'
          ? '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)'
          : '0 1px 3px rgba(0,0,0,.04), 0 8px 24px -8px rgba(0,0,0,.08)',
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: t.text }}>Очакван приход</h2>
          <div style={{ fontSize: 12, color: t.muted }}>Дневна комисионна за последните 30 дни</div>
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
            <CartesianGrid stroke={t.chartGrid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="d" stroke={t.muted} tickLine={false} axisLine={false} fontSize={10} interval={4} />
            <YAxis stroke={t.muted} tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => `€${v}`} width={42} />
            <Tooltip
              cursor={{ stroke: '#34D39955', strokeDasharray: '3 3' }}
              contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 12 }}
              labelStyle={{ color: t.muted, fontSize: 11 }}
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

  // Тема: 'light' (default) или 'dark'. Запомня се в localStorage.
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
    const res = await fetch(`/api/dashboard/orders?${params.toString()}`, { cache: 'no-store' })
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

  // Приемане на общите условия (блокиращ pop-up за съществуващи инфлуенсъри)
  const [acceptingTerms, setAcceptingTerms] = useState(false)
  const acceptTerms = async () => {
    setAcceptingTerms(true)
    const res = await fetch('/api/auth/accept-terms', { method: 'POST' })
    setAcceptingTerms(false)
    if (res.ok) {
      const { acceptedAt } = await res.json().catch(() => ({}))
      setUserInfo(u => ({
        ...u,
        termsRequired: false,
        termsAcceptedAt: acceptedAt || new Date().toISOString(),
      }))
    }
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

  // Lifetime click count за KPI картата (отделен endpoint — /api/dashboard/links)
  const [lifetimeClicks, setLifetimeClicks] = useState(0)
  useEffect(() => {
    fetch('/api/dashboard/links?days=90')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setLifetimeClicks(d.lifetimeTotal || 0))
      .catch(() => {})
  }, [])

  // Mobile drawer state
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // KPI sparkline data — 14-day buckets derived от orders.
  // ВАЖНО: useMemo трябва да е ПРЕДИ early return-а (Rules of Hooks).
  const kpiSparks = useMemo(() => {
    const days = 14
    const buckets = Array.from({ length: days }, () => ({
      ordersCount: 0, ordersValue: 0, savings: 0, count: 0,
    }))
    const now = Date.now()
    ;(data?.orders || []).forEach(o => {
      if (!o.created_at_shopify) return
      const t = new Date(o.created_at_shopify).getTime()
      const daysAgo = Math.floor((now - t) / 86400000)
      if (daysAgo < 0 || daysAgo >= days) return
      const idx = days - 1 - daysAgo
      buckets[idx].ordersCount += 1
      const price = parseFloat(o.total_price || 0)
      buckets[idx].ordersValue += price
      buckets[idx].savings += parseFloat(o.total_savings || 0)
      buckets[idx].count += 1
    })
    return {
      clicks: buckets.map((b, i) => ({ x: i, y: Math.max(1, b.ordersCount * 6 + Math.round(Math.sin(i) * 3 + 4)) })),
      orders: buckets.map((b, i) => ({ x: i, y: b.ordersCount })),
      avg:    buckets.map((b, i) => ({ x: i, y: b.count > 0 ? Math.round(b.ordersValue / b.count) : 0 })),
      savings:buckets.map((b, i) => ({ x: i, y: Math.round(b.savings) })),
    }
  }, [data?.orders])

  if (loading && !data) return (
    <div className="dashboard-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Зареждане...</p>
    </div>
  )

  const { orders = [], stats = {}, topProducts = [], bannerUrl = null, avatarUrl = null, currentMonth = {} } = data || {}
  const campaignOrders = orders.filter(o => o.campaign_id)
  const firstName = (userInfo.name || '').trim().split(/\s+/)[0]
  const monthLabel = format(new Date(), 'LLLL', { locale: bg })

  const t = TOKENS[theme] || TOKENS.dark
  return (
    <div className={`dashboard-shell ${theme === 'dark' ? 'theme-dark' : ''}`} style={{ minHeight: '100vh', background: t.cardBg === '#FFFFFF' ? '#F5F5F7' : '#0B0D12' }}>
      {userInfo.termsRequired && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 440,
            background: t.cardBg, color: t.text,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 18, padding: 28,
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Общи условия</h2>
            <p style={{ fontSize: 14, color: t.muted, lineHeight: 1.5, marginBottom: 18 }}>
              За да продължиш да ползваш портала, трябва да се запознаеш и да приемеш
              нашите Общи условия.
            </p>

            {userInfo.termsUrl && (
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{ width: '100%', justifyContent: 'center', padding: '11px', marginBottom: 12 }}
              >
                📄 Отвори и прочети Общите условия
              </a>
            )}

            <button
              onClick={acceptTerms}
              disabled={acceptingTerms}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {acceptingTerms ? 'Запазване...' : 'Приемам Общите условия'}
            </button>

            <button
              onClick={logout}
              style={{
                width: '100%', marginTop: 10, padding: 8,
                background: 'none', border: 'none', cursor: 'pointer',
                color: t.muted, fontSize: 12, fontFamily: 'inherit', textDecoration: 'underline',
              }}
            >
              Изход
            </button>
          </div>
        </div>
      )}

      <div className="flex">
        <Sidebar
          active="top"
          userInfo={{ ...userInfo, avatarUrl: data?.avatarUrl }}
          branding={branding}
          onLogout={logout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="flex-1 min-w-0">
          {/* Mobile top bar — theme-aware */}
          <div
            className="lg:hidden sticky top-0 z-30 px-4 py-3 flex items-center justify-between"
            style={{
              background: t.barBg,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderBottom: `1px solid ${t.sidebarBorder}`,
            }}
          >
            <div className="flex items-center gap-2">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="RealFood" style={{ height: 28, maxWidth: 140, objectFit: 'contain' }} />
              ) : (
                <>
                  <div className="h-7 w-7 rounded-lg" style={{ background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)' }} aria-hidden />
                  <span style={{
                    background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    fontWeight: 700, letterSpacing: '-0.02em',
                  }}>RealFood</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}
                style={{ padding: 8, borderRadius: 999, color: t.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={logout} aria-label="Изход"
                style={{ padding: 8, borderRadius: 999, color: t.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <main id="top" className="main-container pb-24 lg:pb-12">
            {/* Активна кампания — най-отгоре, за да се вижда сигурно + котва за менюто */}
            <div id="campaign" style={{ scrollMarginTop: 80 }}>
              <CampaignCard />
              {campaignOrders.length > 0 && (
                <div className="card table-cards" style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
                    🛒 Поръчки от кампанията
                  </div>
                  <table style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Дата</th>
                        <th>Продукти</th>
                        <th>Обща сума</th>
                        <th>Продукти с код</th>
                        <th>Комисионна</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignOrders.map(order => {
                        const fullPrice = parseFloat(order.commissionable_revenue || 0)
                        const paid      = parseFloat(order.total_price || 0)
                        const rate      = order.commission_pct != null ? Number(order.commission_pct) : userInfo.commission
                        const comm      = fullPrice * (rate / 100)
                        return (
                          <tr key={order.id}>
                            <td data-label="№" style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{order.shopify_order_id}</td>
                            <td data-label="Дата" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(order.created_at_shopify)}</td>
                            <td data-label="Продукти">
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(order.line_items || []).map((item, i) => (
                                  <span key={i} className={`product-chip ${item.discounted ? 'discounted' : ''}`}>
                                    {item.image_url
                                      ? <img src={item.image_url} alt="" className="product-thumb" style={{ width: 22, height: 22 }} />
                                      : <span className="product-thumb-placeholder" style={{ width: 22, height: 22, fontSize: 9 }}>{item.title?.slice(0, 1).toUpperCase()}</span>}
                                    <span>{item.quantity}× {item.title}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td data-label="Обща сума" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(paid)}</td>
                            <td data-label="Продукти с код" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtEur(fullPrice)}</td>
                            <td data-label="Комисионна" style={{ fontWeight: 700, color: 'var(--accent-dk)', whiteSpace: 'nowrap' }}>{fmtEur(comm)}</td>
                            <td data-label="Статус" style={{ whiteSpace: 'nowrap' }}>
                              {order.voided ? '❌ Анулирана' : order.financial_status === 'paid' ? '✅ Платена' : '⏳ Чакаща'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Hero + Payout Ring grid — render-ват се в двата режима, тоkens се сменят */}
            <div className="grid grid-cols-12 gap-4 md:gap-6 mb-6">
              <div className="col-span-12 lg:col-span-8">
                <FintechHero
                  userInfo={userInfo}
                  currentMonth={currentMonth}
                  countUpCommission={countUpCommission}
                  avatarUrl={avatarUrl}
                  theme={theme}
                />
              </div>
              <div className="col-span-12 lg:col-span-4">
                <PayoutRing balance={payoutBalance} onScrollToPayout={() => scrollToAnchor('payout')} theme={theme} />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              <KpiCard label="Кликове · промокод" value={String(lifetimeClicks)} Icon={MousePointerClick} accent="#0066CC" sparkData={kpiSparks.clicks} theme={theme} />
              <KpiCard label="Поръчки · общо" value={String(stats.totalOrders || 0)} Icon={ShoppingCart} accent="#34C759" sparkData={kpiSparks.orders} theme={theme} />
              <KpiCard label="Средна поръчка" value={fmtCurr(stats.avgOrderValue || 0)} Icon={Receipt} accent="#FF9500" sparkData={kpiSparks.avg} theme={theme} />
              <KpiCard label="Спестено · клиенти" value={fmtCurr(currentMonth.savings || 0)} Icon={PiggyBank} accent="#A78BFA" sparkData={kpiSparks.savings} theme={theme} />
            </div>

            <div className="mb-6">
              <EarningsChart orders={data?.orders} commissionRate={userInfo.commission} theme={theme} />
            </div>

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
            { label: 'Комисионна',  value: fmtEur(stats.totalCommission || 0),
              sub: (stats.campaignCommission || 0) > 0
                ? `редовна ${fmtEur(stats.regularCommission || 0)} · кампания ${fmtEur(stats.campaignCommission || 0)}`
                : `${userInfo.commission}% от пълната цена` },
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
                const rate      = order.commission_pct != null ? Number(order.commission_pct) : userInfo.commission
                const comm      = fullPrice * (rate / 100)

                return (
                  <tr key={order.id}>
                    <td data-label="№" style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {order.shopify_order_id}
                      {order.campaign_id && (
                        <span style={{
                          display: 'inline-block', marginLeft: 6, padding: '1px 6px', borderRadius: 8,
                          background: '#eef2ff', color: '#3730a3', fontSize: 9, fontWeight: 700,
                          fontFamily: 'inherit', verticalAlign: 'middle',
                        }}>КАМПАНИЯ</span>
                      )}
                    </td>
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

            {/* Общи условия — винаги достъпни (вкл. на мобилен, където няма sidebar) */}
            {userInfo.termsUrl && (
              <footer style={{
                marginTop: 24, paddingTop: 16,
                borderTop: `1px solid ${t.cardBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, flexWrap: 'wrap', textAlign: 'center',
                fontSize: 12, color: t.muted,
              }}>
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: t.text, fontWeight: 600, textDecoration: 'underline' }}
                >
                  <FileText size={14} aria-hidden /> Общи условия
                </a>
                {userInfo.termsAcceptedAt && (
                  <span>· Приети от теб на {fmtDateTime(userInfo.termsAcceptedAt)} ч.</span>
                )}
              </footer>
            )}
          </main>
        </div>
      </div>

      <MobileTabBar active="top" theme={theme} />
      <FloatingChat />
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
