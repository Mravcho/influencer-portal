'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { bg } from 'date-fns/locale'

const ymd = (d) => format(d, 'yyyy-MM-dd')
function buildShortcuts() {
  const now = new Date()
  const thisMonth = startOfMonth(now)
  const lastMonthDate = subMonths(now, 1)
  return [
    { key: '7',  label: '7 дни',       days: 7 },
    { key: '30', label: '30 дни',      days: 30 },
    { key: '90', label: '90 дни',      days: 90 },
    { key: 'tm', label: 'Този месец',  from: ymd(thisMonth),            to: ymd(now) },
    { key: 'lm', label: 'Минал месец', from: ymd(startOfMonth(lastMonthDate)), to: ymd(endOfMonth(lastMonthDate)) },
  ]
}

function MiniBars({ daily, color = '#1D9E75', height = 60 }) {
  const max = Math.max(...daily.map(d => d.count), 0) || 1
  const w = 100 / daily.length
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
      {daily.map((d, i) => {
        const h = (d.count / max) * (height - 4)
        return (
          <rect
            key={i}
            x={i * w + w * 0.15}
            y={height - h - 2}
            width={w * 0.7}
            height={h}
            fill={color}
            opacity={d.count > 0 ? 1 : 0.15}
            rx="0.5"
          />
        )
      })}
    </svg>
  )
}

export default function ShareLinksWidget({ viewId = null, baseUrl }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [copiedId, setCopiedId] = useState(null)

  const shortcuts = useMemo(() => buildShortcuts(), [])
  const [activeShortcut, setActiveShortcut] = useState('30')
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const portalBase = useMemo(() => {
    if (baseUrl) return baseUrl
    if (typeof window !== 'undefined') return window.location.origin
    return ''
  }, [baseUrl])

  const load = useCallback((params) => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (viewId) qs.set('viewId', viewId)
    if (params?.from) qs.set('from', params.from)
    if (params?.to)   qs.set('to', params.to)
    if (params?.days && !params.from && !params.to) qs.set('days', String(params.days))
    fetch(`/api/dashboard/links?${qs.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [viewId])

  useEffect(() => { load({ days: 30 }) }, [load])

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

  const links = data?.links || []
  const stats = data ? { total: data.total, lifetimeTotal: data.lifetimeTotal, daily: data.daily, topReferrers: data.topReferrers } : null

  const fullUrl = (code) => `${portalBase}/r/${code}`

  const copy = async (code, id) => {
    try {
      await navigator.clipboard.writeText(fullUrl(code))
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      alert('Не успях да копирам — селектирай линка ръчно')
    }
  }

  if (loading && !data) return null

  const totalClicks    = stats?.total || 0
  const lifetimeClicks = stats?.lifetimeTotal || 0

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      {/* Заглавие + 2 числа: за периода и общо */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            🔗 Твоят споделяем линк
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>
            {totalClicks} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>клика за избрания период</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Общо до сега
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-dk)' }}>
            {lifetimeClicks}
          </div>
        </div>
      </div>

      {/* Date filters */}
      <div className="filter-row" style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: 4 }}>
          Период:
        </div>
        {shortcuts.map(sc => (
          <button
            key={sc.key}
            className={`chip ${activeShortcut === sc.key ? 'active' : ''}`}
            onClick={() => applyShortcut(sc)}
            disabled={loading}
          >{sc.label}</button>
        ))}
        <input
          type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ fontSize: 11, padding: '4px 6px', width: 'auto' }}
        />
        <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
        <input
          type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ fontSize: 11, padding: '4px 6px', width: 'auto' }}
        />
        <button
          className={`chip ${activeShortcut === 'custom' ? 'active' : ''}`}
          onClick={applyCustom}
          disabled={(!from && !to) || loading}
        >Приложи</button>
      </div>

      {/* Mini chart на кликовете */}
      {stats?.daily && stats.daily.length > 0 && totalClicks > 0 && (
        <div style={{ marginBottom: 14 }}>
          <MiniBars daily={stats.daily} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            <span>{format(parseISO(stats.daily[0].date), 'd MMM yyyy', { locale: bg })}</span>
            <span>{format(parseISO(stats.daily[stats.daily.length - 1].date), 'd MMM yyyy', { locale: bg })}</span>
          </div>
        </div>
      )}

      {totalClicks === 0 && lifetimeClicks > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Няма кликове в избрания период. Пробвай по-широк диапазон.
        </p>
      )}

      {/* Списък с линкове */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map(l => (
          <div key={l.id} style={{
            padding: 12, background: 'var(--accent-lt)',
            border: '1px solid var(--accent)', borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {l.is_default ? 'Кратък линк за споделяне в соц. мрежи' : (l.label || 'Промо линк')}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{l.clicks}</strong> {l.clicks === 1 ? 'клик' : 'клика'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{
                flex: 1, minWidth: 0, fontSize: 13, padding: '8px 12px',
                background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{fullUrl(l.short_code)}</code>
              <button
                className="btn btn-primary"
                onClick={() => copy(l.short_code, l.id)}
                style={{ minWidth: 100 }}
              >
                {copiedId === l.id ? '✓ Копирано' : '📋 Копирай'}
              </button>
            </div>

            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
              Споделяй този линк в социалните мрежи. След клик клиентът получава твоя промо код автоматично.
            </p>
          </div>
        ))}
      </div>

      {/* Откъде идват кликовете */}
      {stats?.topReferrers?.length > 0 && (
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
            Откъде идват
          </div>
          {stats.topReferrers.map(r => (
            <div key={r.host} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.host}</span>
              <strong>{r.count}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
