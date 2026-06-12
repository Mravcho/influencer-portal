'use client'
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import AdminShell from './components/AdminShell'
import TopInfluencersByOrders from './components/TopInfluencersByOrders'

const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`
const fmtCurr = (n) => new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))

const PERIODS = [
  { key: 1,  label: 'Днес' },
  { key: 7,  label: '7 дни' },
  { key: 30, label: '30 дни' },
  { key: 90, label: '90 дни' },
]

function OrdersChart({ days, theme }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch(`/api/admin/stats?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [days])

  const daily = data?.daily || []
  const totalOrders = daily.reduce((s, d) => s + (d.orders || 0), 0)

  const chartData = useMemo(() => {
    return daily.map(d => ({
      d: format(new Date(d.date), 'd MMM', { locale: bg }),
      orders: d.orders || 0,
    }))
  }, [daily])

  const t = theme === 'dark'
    ? { card: '#14171F', border: 'rgba(255,255,255,0.06)', text: '#F5F7FA', muted: '#A1A8B8', grid: 'rgba(255,255,255,0.06)' }
    : { card: '#FFFFFF', border: '#E5E5EA', text: '#1D1D1F', muted: '#6E6E73', grid: 'rgba(0,0,0,0.06)' }

  return (
    <motion.section whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
      style={{
        borderRadius: 20,
        background: t.card,
        border: `1px solid ${t.border}`,
        padding: 20,
        boxShadow: theme === 'dark'
          ? '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)'
          : '0 1px 3px rgba(0,0,0,.04), 0 8px 24px -8px rgba(0,0,0,.08)',
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Поръчки по дни
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: t.text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {totalOrders}
        </div>
      </div>
      <div style={{ height: 200, marginLeft: -8, marginRight: -8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="ordersArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={t.grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="d" stroke={t.muted} tickLine={false} axisLine={false} fontSize={10} interval={Math.max(0, Math.floor(chartData.length / 6))} />
            <YAxis stroke={t.muted} tickLine={false} axisLine={false} fontSize={10} width={32} />
            <Tooltip
              cursor={{ stroke: '#34D39955', strokeDasharray: '3 3' }}
              contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, color: t.text }}
              labelStyle={{ color: t.muted, fontSize: 11 }}
              formatter={(v) => [`${v} поръчки`, '']}
            />
            <Area type="monotone" dataKey="orders" stroke="#34D399" strokeWidth={2.5} fill="url(#ordersArea)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  )
}

function CommissionsByMonthChart({ theme }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    fetch('/api/admin/stats?days=180')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  const monthly = data?.monthly || []
  const totalCommission = monthly.reduce((s, m) => s + (m.commission || 0), 0)

  const chartData = useMemo(() => {
    return monthly.map(m => ({
      m: format(new Date(m.month + '-01'), 'LLL', { locale: bg }),
      commission: Math.round((m.commission || 0) * 100) / 100,
    }))
  }, [monthly])

  const t = theme === 'dark'
    ? { card: '#14171F', border: 'rgba(255,255,255,0.06)', text: '#F5F7FA', muted: '#A1A8B8', grid: 'rgba(255,255,255,0.06)' }
    : { card: '#FFFFFF', border: '#E5E5EA', text: '#1D1D1F', muted: '#6E6E73', grid: 'rgba(0,0,0,0.06)' }

  return (
    <motion.section whileHover={{ y: -2 }} transition={{ duration: 0.2 }}
      style={{
        borderRadius: 20,
        background: t.card,
        border: `1px solid ${t.border}`,
        padding: 20,
        boxShadow: theme === 'dark'
          ? '0 1px 2px rgba(0,0,0,.3), 0 8px 24px -8px rgba(0,0,0,.5)'
          : '0 1px 3px rgba(0,0,0,.04), 0 8px 24px -8px rgba(0,0,0,.08)',
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          Комисионни по месеци
        </div>
        <div style={{
          fontSize: 26, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums',
          background: 'linear-gradient(135deg, #34D399 0%, #A3E635 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {fmtCurr(totalCommission)}
        </div>
      </div>
      <div style={{ height: 200, marginLeft: -8, marginRight: -8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="commBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A3E635" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={t.grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="m" stroke={t.muted} tickLine={false} axisLine={false} fontSize={11} />
            <YAxis stroke={t.muted} tickLine={false} axisLine={false} fontSize={10} width={42} tickFormatter={v => `€${v}`} />
            <Tooltip
              cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
              contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, color: t.text }}
              labelStyle={{ color: t.muted, fontSize: 11 }}
              formatter={(v) => [fmtCurr(v), '']}
            />
            <Bar dataKey="commission" fill="url(#commBar)" radius={[8, 8, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  )
}

export default function AdminHomePage() {
  const [period, setPeriod] = useState(1)
  const [stats, setStats] = useState({ influencers: 0, totalOrders: 0, totalCommission: 0 })

  useEffect(() => {
    fetch('/api/admin/influencers')
      .then(r => r.json())
      .then(list => {
        if (!Array.isArray(list)) return
        const totalOrders = list.reduce((s, i) => s + (i.orderCount || 0), 0)
        const totalCommission = list.reduce((s, i) => s + (i.totalCommission || 0), 0)
        setStats({ influencers: list.length, totalOrders, totalCommission })
      })
      .catch(() => {})
  }, [])

  // Тема — четем от localStorage за да синхронизираме чартовете
  const [theme, setTheme] = useState('light')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rf-portal-theme')
      if (saved === 'dark' || saved === 'light') setTheme(saved)
    } catch {}
    // Слушаме промени от toggle-а в AdminShell
    const onStorage = () => {
      try {
        const v = localStorage.getItem('rf-portal-theme')
        if (v === 'dark' || v === 'light') setTheme(v)
      } catch {}
    }
    window.addEventListener('storage', onStorage)
    // poll на 1с защото localStorage event не работи в същия таб
    const poll = setInterval(onStorage, 1000)
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll) }
  }, [])

  return (
    <AdminShell>
      <div className="main-container">
        <div style={{ marginBottom: 20, paddingTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Начало</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Преглед на ключови метрики и активност</div>
        </div>

        {/* 3 metric cards най-горе */}
        <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
          <div className="metric">
            <div className="metric-label">Инфлуенсъри</div>
            <div className="metric-value">{stats.influencers}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Общо поръчки</div>
            <div className="metric-value">{stats.totalOrders}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Дължими комисионни</div>
            <div className="metric-value">{fmtEur(stats.totalCommission)}</div>
          </div>
        </div>

        {/* Период filter */}
        <div className="chip-row" style={{ marginBottom: 14 }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`chip ${period === p.key ? 'active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >{p.label}</button>
          ))}
        </div>

        {/* Графики — recharts с money gradient */}
        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <OrdersChart days={period} theme={theme} />
          <CommissionsByMonthChart theme={theme} />
        </div>

        {/* Топ инфлуенсъри по поръчки за месеца */}
        <TopInfluencersByOrders />
      </div>
    </AdminShell>
  )
}
