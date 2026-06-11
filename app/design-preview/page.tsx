'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid,
} from 'recharts'
import {
  Clock, TrendingUp, Copy, Lock, Sparkles, Crown,
  MousePointerClick, ShoppingCart, Receipt, Undo2,
  Home, BarChart3, Link2, Users, Trophy, Settings, Menu,
} from 'lucide-react'

/* ────────────────────────────────────────────────────────────
   MOCK DATA — realistic, no lorem
   ──────────────────────────────────────────────────────────── */

const ME = {
  name:   'Sarah Chen',
  handle: '@sarah_chen',
  tier:   'Gold creator',
  initials:'SC',
}

const BALANCE      = 1247.80
const DELTA_PCT    = 18.4
const PAYOUT_GOAL  = 1500
const PAYOUT_NOW   = 1170

const EARNINGS_30D = [
  { d: '01', v: 18  }, { d: '02', v: 32 }, { d: '03', v: 24 }, { d: '04', v: 41 }, { d: '05', v: 55 },
  { d: '06', v: 38  }, { d: '07', v: 47 }, { d: '08', v: 62 }, { d: '09', v: 58 }, { d: '10', v: 73 },
  { d: '11', v: 51  }, { d: '12', v: 68 }, { d: '13', v: 88 }, { d: '14', v: 76 }, { d: '15', v: 102 },
  { d: '16', v: 84  }, { d: '17', v: 95 }, { d: '18', v: 71 }, { d: '19', v: 110},{ d: '20', v: 124 },
  { d: '21', v: 98  }, { d: '22', v: 142}, { d: '23', v: 118}, { d: '24', v: 134},{ d: '25', v: 156 },
  { d: '26', v: 128 }, { d: '27', v: 167}, { d: '28', v: 148}, { d: '29', v: 175},{ d: '30', v: 192 },
]

const COMMISSIONS_6M = [
  { m: 'Jan', Products: 480,  Courses: 120, Services:  60 },
  { m: 'Feb', Products: 620,  Courses: 180, Services:  90 },
  { m: 'Mar', Products: 540,  Courses: 240, Services: 110 },
  { m: 'Apr', Products: 780,  Courses: 320, Services: 140 },
  { m: 'May', Products: 940,  Courses: 410, Services: 180 },
  { m: 'Jun', Products: 1120, Courses: 520, Services: 240, best: true },
]

type SparkPoint = { x: number; y: number }
const sparkData = (n: number, base: number, swing: number): SparkPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i, y: base + Math.round(Math.sin(i / 2) * swing + (Math.random() * swing * 0.3)) }))

const KPIS = [
  { label: 'Total clicks',   value: '12,840',  delta:  12.4, color: 'text-sky-300',    bg: 'bg-sky-500/15',     spark: sparkData(20, 80, 25), Icon: MousePointerClick, accent: '#60A5FA' },
  { label: 'Conversions',    value: '312',     delta:   8.1, color: 'text-emerald-300',bg: 'bg-emerald-500/15', spark: sparkData(20, 50, 20), Icon: ShoppingCart,      accent: '#34D399' },
  { label: 'Avg. order',     value: '€87.40',  delta:   4.2, color: 'text-amber-300',  bg: 'bg-amber-500/15',   spark: sparkData(20, 60, 15), Icon: Receipt,           accent: '#FCD34D' },
  { label: 'Refund rate',    value: '2.3%',    delta:  -0.6, color: 'text-violet-300', bg: 'bg-violet-500/15',  spark: sparkData(20, 30, 10), Icon: Undo2,             accent: '#A78BFA', invertedDelta: true },
]

const TOP_PRODUCTS = [
  { id: 'p1', name: 'Premium Whey Vanilla 900g',     handle: 'PWV-900', clicks: 1820, earnings: 482.40, rate: 14.3, init: 'PW', gradient: 'from-emerald-400 to-lime-400' },
  { id: 'p2', name: 'Creator Masterclass 2026',      handle: 'CM-26',   clicks: 1240, earnings: 392.10, rate: 11.8, init: 'CM', gradient: 'from-violet-400 to-fuchsia-400' },
  { id: 'p3', name: 'BCAA Lemon 300g',                handle: 'BCAA-L',  clicks:  980, earnings: 218.60, rate:  9.1, init: 'BC', gradient: 'from-amber-400 to-orange-400' },
  { id: 'p4', name: 'Coaching Call 1-on-1',           handle: 'COACH',   clicks:  640, earnings: 184.00, rate:  7.4, init: 'CC', gradient: 'from-sky-400 to-cyan-400' },
  { id: 'p5', name: 'Multivitamin Complex 60 capsule',handle: 'MV-60',   clicks:  520, earnings: 124.80, rate:  6.2, init: 'MV', gradient: 'from-rose-400 to-pink-400' },
]

const MILESTONES = [
  { id: 'm1', emoji: '💸', title: 'First €1K month',  desc: 'Hit €1,000 in a single month',  progress: 100, locked: false },
  { id: 'm2', emoji: '👥', title: '10 referrals',      desc: 'Refer 10 active creators',       progress: 100, locked: false },
  { id: 'm3', emoji: '🚀', title: '€5K total',         desc: 'Reach €5,000 in lifetime earnings', progress: 64,  locked: true  },
  { id: 'm4', emoji: '👑', title: 'Platinum tier',     desc: 'Reach €10K lifetime + 50 referrals', progress: 21,  locked: true  },
]

const REFERRALS = [
  { id: 'r1', name: 'Mia Park',      handle: '@mia.park',     joined: 'Aug 2025', earnings: 78.20, init: 'MP', gradient: 'from-rose-400 to-pink-400' },
  { id: 'r2', name: 'Daniel Ortega', handle: '@dorty',        joined: 'Sep 2025', earnings: 62.40, init: 'DO', gradient: 'from-amber-400 to-orange-400' },
  { id: 'r3', name: 'Aisha Khan',    handle: '@aishak',       joined: 'Oct 2025', earnings: 43.80, init: 'AK', gradient: 'from-sky-400 to-cyan-400' },
]
const NETWORK_EARNINGS = 184.40

const ACTIVITY = [
  { id: 'a1', who: '@mia.park',   action: 'bought',    product: 'Premium Whey Vanilla 900g',  amount: 24.10, t: '14m ago', gradient: 'from-rose-400 to-pink-400',  init: 'MP' },
  { id: 'a2', who: '@kazuto',     action: 'bought',    product: 'Creator Masterclass 2026',   amount: 38.20, t:  '1h ago', gradient: 'from-violet-400 to-fuchsia-400', init: 'KA' },
  { id: 'a3', who: '@_lena_',     action: 'bought',    product: 'Coaching Call 1-on-1',       amount: 46.00, t:  '3h ago', gradient: 'from-amber-400 to-orange-400', init: 'LE' },
  { id: 'a4', who: '@dorty',      action: 'subscribed',product: 'Premium tier',               amount: 12.40, t:  '5h ago', gradient: 'from-emerald-400 to-lime-400', init: 'DO' },
  { id: 'a5', who: '@aishak',     action: 'bought',    product: 'BCAA Lemon 300g',            amount:  8.70, t:  '8h ago', gradient: 'from-sky-400 to-cyan-400',   init: 'AK' },
  { id: 'a6', who: '@kalu',       action: 'bought',    product: 'Multivitamin Complex',       amount: 11.20, t: 'Yesterday',gradient:'from-violet-400 to-fuchsia-400',init: 'KA' },
]

const fmtEur = (n: number) =>
  new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' }).format(n)

/* ────────────────────────────────────────────────────────────
   Hooks
   ──────────────────────────────────────────────────────────── */

function useCountUp(target: number, duration = 1400, deps: any[] = []) {
  const [v, setV] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { setV(target); return }
    let raf: number
    let start: number | null = null
    const tick = (now: number) => {
      if (start === null) start = now
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setV(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setV(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, ...deps])
  return v
}

/* ────────────────────────────────────────────────────────────
   Reusable primitives (no shadcn — small + self-contained)
   ──────────────────────────────────────────────────────────── */

function Avatar({ initials, gradient = 'from-emerald-400 to-lime-400', size = 40 }: {
  initials: string; gradient?: string; size?: number
}) {
  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-semibold text-[#0B0D12]`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </div>
  )
}

function DeltaPill({ value, inverted = false }: { value: number; inverted?: boolean }) {
  const positive = inverted ? value < 0 : value > 0
  const cls = positive
    ? 'bg-emerald-500/15 text-emerald-300'
    : 'bg-rose-500/15 text-rose-300'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>
      <TrendingUp className={value < 0 ? 'rotate-180' : ''} size={12} aria-hidden />
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={`rounded-3xl bg-[#14171F] p-6 shadow-card ring-1 ring-white/[.06] ${className}`}
    >
      {children}
    </motion.section>
  )
}

/* ────────────────────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────────────────────── */

function Hero() {
  const balance = useCountUp(BALANCE)
  return (
    <motion.section
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="relative overflow-hidden rounded-3xl bg-hero-gradient p-8 shadow-hero"
    >
      {/* SVG grain overlay */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" aria-hidden>
        <filter id="n"><feTurbulence baseFrequency="0.9" numOctaves="2" /></filter>
        <rect width="100%" height="100%" filter="url(#n)" />
      </svg>

      <div className="relative">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-[.18em] text-white/60">Available balance</div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/[.08] px-3 py-1 text-xs text-white/80 ring-1 ring-white/[.12]">
              <Clock size={13} aria-hidden /> Next payout in 6 days
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-sm font-medium text-white">{ME.name}</div>
              <div className="text-xs text-white/60">{ME.handle}</div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-300/15 text-amber-200 ring-1 ring-amber-300/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                <Crown size={11} aria-hidden /> {ME.tier}
              </div>
            </div>
            <Avatar initials={ME.initials} gradient="from-amber-300 to-orange-400" size={56} />
          </div>
        </div>

        <div className="mt-6">
          <div className="bg-money-gradient bg-clip-text text-transparent text-5xl md:text-6xl font-display font-semibold tracking-tight tabular-nums">
            {fmtEur(balance)}
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25 px-2.5 py-1 text-xs font-semibold tabular-nums">
            <TrendingUp size={14} aria-hidden /> +{DELTA_PCT}% vs last month
          </div>
        </div>
      </div>
    </motion.section>
  )
}

/* ────────────────────────────────────────────────────────────
   Payout Progress Ring
   ──────────────────────────────────────────────────────────── */

function PayoutRing() {
  const pct = Math.round((PAYOUT_NOW / PAYOUT_GOAL) * 100)
  const radius = 78
  const circ   = 2 * Math.PI * radius
  const reduce = useReducedMotion()

  return (
    <SectionCard className="flex flex-col items-center">
      <div className="w-full text-[11px] uppercase tracking-[.18em] text-muted">Payout progress</div>

      <div className="relative my-4 grid place-items-center" style={{ width: 180, height: 180 }}>
        <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#A3E635" />
            </linearGradient>
          </defs>
          <circle cx="90" cy="90" r={radius} stroke="rgba(255,255,255,.08)" strokeWidth="14" fill="none" />
          <motion.circle
            cx="90" cy="90" r={radius}
            stroke="url(#ringGrad)" strokeWidth="14" fill="none" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - (circ * pct) / 100 }}
            transition={{ duration: reduce ? 0 : 1.4, ease: [0.21, 1.02, 0.73, 1] }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <div className="text-4xl font-display font-semibold tabular-nums text-fg">{pct}%</div>
          <div className="mt-1 text-xs tabular-nums text-muted">
            {fmtEur(PAYOUT_NOW)} / {fmtEur(PAYOUT_GOAL)}
          </div>
        </div>
      </div>

      <button
        disabled
        className="w-full rounded-2xl bg-money-gradient text-[#0B0D12] font-semibold py-2.5 opacity-50 cursor-not-allowed disabled:hover:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D12]"
      >
        Request payout
      </button>
      <p className="mt-2 text-center text-[11px] text-muted">Available at 100%</p>
    </SectionCard>
  )
}

/* ────────────────────────────────────────────────────────────
   KPI Card
   ──────────────────────────────────────────────────────────── */

function KpiCard({ kpi }: { kpi: typeof KPIS[number] }) {
  return (
    <SectionCard className="!p-5">
      <div className="flex items-start justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-2xl ${kpi.bg} ${kpi.color}`}>
          <kpi.Icon size={18} aria-hidden />
        </div>
        <DeltaPill value={kpi.delta} inverted={kpi.invertedDelta} />
      </div>
      <div className="mt-4 text-[11px] uppercase tracking-[.18em] text-muted">{kpi.label}</div>
      <div className="text-2xl font-display font-semibold tabular-nums text-fg">{kpi.value}</div>
      <div className="mt-3 -mx-2 h-[60px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={kpi.spark} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`spark-${kpi.label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={kpi.accent} stopOpacity={0.5} />
                <stop offset="100%" stopColor={kpi.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="y" stroke={kpi.accent} strokeWidth={1.5} fill={`url(#spark-${kpi.label})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}

/* ────────────────────────────────────────────────────────────
   Earnings Area Chart (30D / segmented control)
   ──────────────────────────────────────────────────────────── */

function EarningsChart() {
  const [range, setRange] = useState<'7D' | '30D' | '90D' | 'All'>('30D')
  const data = EARNINGS_30D
  const avg = data.reduce((s, d) => s + d.v, 0) / data.length

  return (
    <SectionCard>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Earnings</h2>
          <div className="text-xs text-muted">Daily commission over the last {range}</div>
        </div>
        <div className="inline-flex rounded-full bg-white/[.04] ring-1 ring-white/[.08] p-1">
          {(['7D', '30D', '90D', 'All'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                range === r ? 'bg-white text-[#0B0D12]' : 'text-muted hover:text-fg'
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[280px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="earnArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#34D399" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis dataKey="d" stroke="#8A93A6" tickLine={false} axisLine={false} fontSize={11} interval={3} />
            <YAxis stroke="#8A93A6" tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => `€${v}`} width={42} />
            <Tooltip
              cursor={{ stroke: '#34D39955', strokeDasharray: '3 3' }}
              contentStyle={{ background: '#14171F', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12 }}
              labelStyle={{ color: '#8A93A6', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em' }}
              formatter={(v: number) => [<span key="v" className="font-semibold tabular-nums" style={{ color: '#A3E635' }}>{fmtEur(v)}</span>, '']}
            />
            <CartesianGrid stroke="#ffffff10" strokeDasharray="2 6" horizontal={true} vertical={false} />
            <Area type="monotone" dataKey="v" stroke="#34D399" strokeWidth={2.5} fill="url(#earnArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}

/* ────────────────────────────────────────────────────────────
   Commission Stacked Bar
   ──────────────────────────────────────────────────────────── */

function CommissionStacked() {
  return (
    <SectionCard>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-display font-semibold">Commission growth</h2>
          <div className="text-xs text-muted">Last 6 months · by source</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <Legend dot="#34D399" label="Products" />
          <Legend dot="#A78BFA" label="Courses" />
          <Legend dot="#FCD34D" label="Services" />
        </div>
      </div>

      <div className="mt-4 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={COMMISSIONS_6M} barCategoryGap={24} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="m" stroke="#8A93A6" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis stroke="#8A93A6" tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => `€${v}`} width={42} />
            <Tooltip
              cursor={{ fill: '#ffffff08' }}
              contentStyle={{ background: '#14171F', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12 }}
              labelStyle={{ color: '#8A93A6', fontSize: 11 }}
              formatter={(v: number, n) => [<span key={n} className="tabular-nums">{fmtEur(v)}</span>, n]}
            />
            <Bar dataKey="Services"  stackId="a" fill="#FCD34D"        radius={[0, 0, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Courses"   stackId="a" fill="#A78BFA"        radius={[0, 0, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Products"  stackId="a" fill="url(#barMoney)" radius={[8, 8, 0, 0]} maxBarSize={32} />
            <defs>
              <linearGradient id="barMoney" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A3E635" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────
   Top Products
   ──────────────────────────────────────────────────────────── */

function TopProducts() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (id: string) => {
    setCopied(id)
    setTimeout(() => setCopied(null), 1400)
  }
  return (
    <SectionCard>
      <h2 className="text-lg font-display font-semibold">Top performing</h2>
      <div className="mt-3 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-[.18em] text-muted pb-2 border-b border-white/5">
        <div className="col-span-5">Product</div>
        <div className="col-span-2 text-right">Clicks</div>
        <div className="col-span-2 text-right">Earnings</div>
        <div className="col-span-1 text-right">Rate</div>
        <div className="col-span-2" />
      </div>
      <div className="divide-y divide-white/5">
        {TOP_PRODUCTS.map(p => (
          <div key={p.id} className="grid grid-cols-12 gap-3 items-center py-3 hover:bg-white/[.03] -mx-2 px-2 rounded-xl">
            <div className="col-span-5 flex items-center gap-3 min-w-0">
              <div
                className={`h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br ${p.gradient} grid place-items-center text-[#0B0D12] font-semibold`}
                aria-hidden
              >{p.init}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted">{p.handle}</div>
              </div>
            </div>
            <div className="col-span-2 text-right text-sm tabular-nums">{p.clicks.toLocaleString('en-EU')}</div>
            <div className="col-span-2 text-right">
              <span className="bg-money-gradient bg-clip-text text-transparent font-semibold tabular-nums">{fmtEur(p.earnings)}</span>
            </div>
            <div className="col-span-1 text-right">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-300 text-[11px] px-2 py-0.5 tabular-nums">{p.rate}%</span>
            </div>
            <div className="col-span-2 flex justify-end">
              <button
                onClick={() => copy(p.id)}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted hover:text-fg hover:bg-white/[.04] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D12]"
              >
                <Copy size={13} aria-hidden /> {copied === p.id ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/* ────────────────────────────────────────────────────────────
   Referrals
   ──────────────────────────────────────────────────────────── */

function Referrals() {
  const network = useCountUp(NETWORK_EARNINGS)
  const [copied, setCopied] = useState(false)
  return (
    <SectionCard className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-referral-gradient opacity-[0.08]" aria-hidden />
      <div className="relative">
        <div className="text-[11px] uppercase tracking-[.18em] text-muted">Your referral network</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="bg-referral-gradient bg-clip-text text-transparent text-3xl font-display font-semibold tabular-nums">
            {fmtEur(network)}
          </div>
          <span className="text-xs text-muted">earned from your network</span>
        </div>

        <div className="mt-5 space-y-3">
          {REFERRALS.map(r => (
            <div key={r.id} className="flex items-center gap-3">
              <Avatar initials={r.init} gradient={r.gradient} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-[11px] text-muted">{r.handle} · joined {r.joined}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-violet-300">+{fmtEur(r.earnings)}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-muted">
            <Link2 size={14} aria-hidden />
            <span className="truncate">lumen.app/r/sarah_chen</span>
          </div>
          <button
            onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }}
            className="rounded-2xl bg-money-gradient text-[#0B0D12] text-xs font-semibold px-3 py-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D12]"
          >{copied ? 'Copied!' : 'Copy'}</button>
          <div className="h-14 w-14 rounded-xl bg-white/[.06] ring-1 ring-white/10 grid place-items-center" aria-hidden>
            {/* QR placeholder — checker pattern */}
            <svg width="40" height="40" viewBox="0 0 8 8">
              {Array.from({ length: 8 }).flatMap((_, y) =>
                Array.from({ length: 8 }).map((_, x) =>
                  ((x + y) % 2 === 0 || (x === 0 && y < 3) || (x === 7 && y > 4))
                    ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#F5F7FA" />
                    : null
                )
              )}
            </svg>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

/* ────────────────────────────────────────────────────────────
   Milestones
   ──────────────────────────────────────────────────────────── */

function Milestones() {
  return (
    <SectionCard>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold">Milestones</h2>
        <Sparkles size={16} className="text-amber-300" aria-hidden />
      </div>
      <div className="mt-4 flex flex-col gap-3 md:flex-col">
        {MILESTONES.map(m => (
          <div key={m.id} className="relative">
            {!m.locked ? (
              <div className="rounded-3xl p-[1.5px] bg-milestone-gradient">
                <div className="rounded-[calc(1.5rem-1.5px)] bg-[#14171F] p-4">
                  <MilestoneInner m={m} />
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-[#14171F] ring-1 ring-white/[.06] p-4 grayscale-[.4] opacity-80">
                <MilestoneInner m={m} />
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
function MilestoneInner({ m }: { m: typeof MILESTONES[number] }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-2xl">{m.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          {m.title}
          {m.locked && <Lock size={12} className="text-muted" aria-hidden />}
        </div>
        <div className="text-[11px] text-muted truncate">{m.desc}</div>
        <div className="mt-2 h-[2px] bg-white/[.06] rounded-full overflow-hidden">
          <div className="h-full bg-money-gradient rounded-full" style={{ width: `${m.progress}%` }} />
        </div>
      </div>
      <div className="text-xs font-semibold tabular-nums text-muted">{m.progress}%</div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
   Activity Feed
   ──────────────────────────────────────────────────────────── */

function ActivityFeed() {
  return (
    <SectionCard>
      <h2 className="text-lg font-display font-semibold">Recent activity</h2>
      <div className="relative mt-4 pl-4">
        {/* timeline line */}
        <div className="absolute left-[10px] top-1 bottom-1 w-px bg-white/[.06]" aria-hidden />
        <div className="space-y-4">
          {ACTIVITY.map(a => (
            <div key={a.id} className="flex items-start gap-3 relative">
              <div className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-money-gradient ring-2 ring-[#14171F]" aria-hidden />
              <div className="pl-4 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm min-w-0">
                    <span className="text-fg">{a.who}</span>
                    <span className="text-muted"> {a.action} </span>
                    <span className="text-fg/90">{a.product}</span>
                  </div>
                  <div className="bg-money-gradient bg-clip-text text-transparent text-sm font-semibold tabular-nums whitespace-nowrap">
                    +{fmtEur(a.amount)}
                  </div>
                </div>
                <div className="text-[11px] text-muted mt-0.5">{a.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

/* ────────────────────────────────────────────────────────────
   Sidebar (desktop) + Mobile Tab Bar
   ──────────────────────────────────────────────────────────── */

const NAV = [
  { id: 'home',       label: 'Dashboard',  Icon: Home,       active: true },
  { id: 'earnings',   label: 'Earnings',   Icon: BarChart3,  active: false },
  { id: 'links',      label: 'Links',      Icon: Link2,      active: false },
  { id: 'referrals',  label: 'Referrals',  Icon: Users,      active: false },
  { id: 'milestones', label: 'Milestones', Icon: Trophy,     active: false },
  { id: 'settings',   label: 'Settings',   Icon: Settings,   active: false },
]

function Sidebar() {
  return (
    <aside className="hidden lg:flex w-[260px] shrink-0 flex-col bg-[#0F1218] border-r border-white/5">
      <div className="px-6 pt-7 pb-4 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-money-gradient" aria-hidden />
        <div className="bg-money-gradient bg-clip-text text-transparent font-display text-xl font-semibold tracking-tight">Lumen</div>
      </div>
      <nav className="px-3 mt-3 flex flex-col gap-1" aria-label="Primary">
        {NAV.map(item => (
          <a key={item.id}
             href="#"
             className={`relative group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0D12] ${
              item.active
                ? 'bg-emerald-400/10 text-emerald-300'
                : 'text-muted hover:text-fg hover:bg-white/[.04]'
             }`}
          >
            {item.active && <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-money-gradient rounded-r" aria-hidden />}
            <item.Icon size={18} aria-hidden />
            {item.label}
          </a>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-2xl bg-[#14171F] ring-1 ring-white/[.06] p-3 flex items-center gap-3">
          <Avatar initials={ME.initials} gradient="from-amber-300 to-orange-400" size={36} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{ME.name}</div>
            <div className="text-[11px] text-amber-300 inline-flex items-center gap-1">
              <Crown size={11} aria-hidden /> {ME.tier}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

const MOBILE_NAV = NAV.slice(0, 5) // 5 icons на mobile tab bar
function MobileTabBar() {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 h-16 bg-[#0F1218]/90 backdrop-blur-xl border-t border-white/5 grid grid-cols-5"
      aria-label="Mobile"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {MOBILE_NAV.map(item => (
        <a key={item.id} href="#" aria-label={item.label}
           className="relative flex flex-col items-center justify-center gap-1 text-muted">
          <item.Icon size={20} aria-hidden className={item.active ? 'text-emerald-300' : ''} />
          {item.active && <span className="h-1 w-1 rounded-full bg-emerald-300" aria-hidden />}
        </a>
      ))}
    </nav>
  )
}

/* ────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────── */

const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-ink text-fg font-sans flex">
      <Sidebar />
      <main className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="max-w-[1440px] mx-auto p-4 md:p-8">
          <div className="lg:hidden flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-money-gradient" aria-hidden />
              <div className="bg-money-gradient bg-clip-text text-transparent font-display text-lg font-semibold tracking-tight">Lumen</div>
            </div>
            <button aria-label="Menu" className="rounded-full p-2 bg-white/[.04] ring-1 ring-white/[.06]">
              <Menu size={18} aria-hidden />
            </button>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-12 gap-4 md:gap-6"
          >
            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-8"><Hero /></motion.div>
            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-4"><PayoutRing /></motion.div>

            {KPIS.map(k => (
              <motion.div key={k.label} variants={fadeUp} className="col-span-6 lg:col-span-3">
                <KpiCard kpi={k} />
              </motion.div>
            ))}

            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-8"><EarningsChart /></motion.div>
            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-4"><Milestones /></motion.div>

            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-7"><CommissionStacked /></motion.div>
            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-5"><Referrals /></motion.div>

            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-8"><TopProducts /></motion.div>
            <motion.div variants={fadeUp} className="col-span-12 lg:col-span-4"><ActivityFeed /></motion.div>
          </motion.div>
        </div>
      </main>
      <MobileTabBar />
    </div>
  )
}
</content>
</invoke>