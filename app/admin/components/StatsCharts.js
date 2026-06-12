'use client'
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'

const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

function BarChart({ data, valueKey, labelKey, formatLabel, formatValue, color, height = 160 }) {
  const max = Math.max(...data.map(d => d[valueKey]), 0) || 1
  const barWidth = 100 / data.length
  const [hover, setHover] = useState(null)

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {/* Хоризонтални линии за grid */}
        {[0.25, 0.5, 0.75].map(p => (
          <line
            key={p}
            x1="0" x2="100"
            y1={height - height * p} y2={height - height * p}
            stroke="#e8e6e0"
            strokeWidth="0.3"
            strokeDasharray="0.5 0.5"
          />
        ))}
        {data.map((d, i) => {
          const v = d[valueKey] || 0
          const h = max ? (v / max) * (height - 20) : 0
          const x = i * barWidth + barWidth * 0.15
          const w = barWidth * 0.7
          const isHover = hover === i
          return (
            <g key={i}>
              <rect
                x={x}
                y={height - h - 4}
                width={w}
                height={h}
                fill={color}
                opacity={isHover ? 1 : 0.85}
                rx="0.6"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer', transition: 'opacity .15s' }}
              />
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hover !== null && data[hover] && (
        <div style={{
          position: 'absolute',
          left: `${(hover + 0.5) * (100 / data.length)}%`,
          bottom: '100%',
          transform: 'translateX(-50%)',
          background: 'var(--text)',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: 6,
          fontSize: 11,
          whiteSpace: 'nowrap',
          marginBottom: 6,
          pointerEvents: 'none',
          zIndex: 2,
        }}>
          <div style={{ fontWeight: 600 }}>{formatLabel(data[hover][labelKey])}</div>
          <div>{formatValue(data[hover][valueKey])}</div>
        </div>
      )}

      {/* X-axis labels (показваме само първа/последна + 2-3 в средата) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
        {data.length > 0 && (
          <>
            <span>{formatLabel(data[0][labelKey])}</span>
            {data.length > 6 && (
              <span>{formatLabel(data[Math.floor(data.length / 2)][labelKey])}</span>
            )}
            <span>{formatLabel(data[data.length - 1][labelKey])}</span>
          </>
        )}
      </div>
    </div>
  )
}

export default function StatsCharts() {
  const [stats, setStats]     = useState(null)
  const [period, setPeriod]   = useState(1) // default = днес
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/stats?days=${period}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  if (loading && !stats) {
    return (
      <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
        Зареждане на статистики...
      </div>
    )
  }

  const daily   = stats?.daily   || []
  const monthly = stats?.monthly || []
  const top     = stats?.topInfluencers || []

  const totalOrders     = daily.reduce((s, d) => s + d.orders, 0)
  const totalCommission = daily.reduce((s, d) => s + d.commission, 0)

  return (
    <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
      {/* Графика 1: Поръчки по дни */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Поръчки по дни
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{totalOrders}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>общо за избрания период</div>
          </div>
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            style={{ width: 'auto', fontSize: 11, padding: '4px 8px' }}
          >
            <option value={1}>Днес</option>
            <option value={7}>7 дни</option>
            <option value={30}>30 дни</option>
            <option value={90}>90 дни</option>
          </select>
        </div>
        <BarChart
          data={daily}
          valueKey="orders"
          labelKey="date"
          formatLabel={(d) => format(parseISO(d), 'd MMM', { locale: bg })}
          formatValue={(v) => `${v} поръчки`}
          color="#1D9E75"
          height={140}
        />
      </div>

      {/* Графика 2: Комисионни по месеци */}
      <div className="card">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Комисионни по месеци
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: 'var(--accent)' }}>
            {fmtEur(totalCommission)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>от поръчките за избрания период</div>
        </div>
        <BarChart
          data={monthly}
          valueKey="commission"
          labelKey="month"
          formatLabel={(m) => {
            const [y, mo] = m.split('-')
            const d = new Date(parseInt(y), parseInt(mo) - 1, 1)
            return format(d, 'MMM yy', { locale: bg })
          }}
          formatValue={fmtEur}
          color="#0F6E56"
          height={140}
        />
      </div>

      {/* Топ инфлуенсъри */}
      {top.length > 0 && (
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
            Топ инфлуенсъри по комисионна
          </div>
          {(() => {
            const maxComm = Math.max(...top.map(t => t.commission), 0) || 1
            return top.map((t, i) => (
              <div key={t.id} style={{ marginBottom: i < top.length - 1 ? 12 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {t.orders} поръчки · <strong style={{ color: 'var(--accent)' }}>{fmtEur(t.commission)}</strong>
                  </span>
                </div>
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${(t.commission / maxComm * 100).toFixed(0)}%` }} />
                </div>
              </div>
            ))
          })()}
        </div>
      )}
    </div>
  )
}
