'use client'
import { useEffect, useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { bg } from 'date-fns/locale'

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
  const [links, setLinks]     = useState([])
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)

  const linksUrl  = viewId ? `/api/dashboard/links?viewId=${viewId}`  : '/api/dashboard/links'
  const clicksUrl = viewId ? `/api/dashboard/clicks?days=90&viewId=${viewId}` : '/api/dashboard/clicks?days=90'

  const portalBase = useMemo(() => {
    if (baseUrl) return baseUrl
    if (typeof window !== 'undefined') return window.location.origin
    return ''
  }, [baseUrl])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(linksUrl).then(r => r.json()),
      fetch(clicksUrl).then(r => r.json()),
    ]).then(([linksRes, statsRes]) => {
      setLinks(linksRes.links || [])
      setStats(statsRes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [linksUrl, clicksUrl])

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

  if (loading) return null

  const totalClicks = stats?.total || 0

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          🔗 Твоят споделяем линк
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>
          {totalClicks} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>клика (90 дни)</span>
        </div>
      </div>

      {/* Mini chart на кликовете */}
      {stats?.daily && stats.daily.length > 0 && totalClicks > 0 && (
        <div style={{ marginBottom: 14 }}>
          <MiniBars daily={stats.daily} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            <span>{format(parseISO(stats.daily[0].date), 'd MMM', { locale: bg })}</span>
            <span>{format(parseISO(stats.daily[stats.daily.length - 1].date), 'd MMM', { locale: bg })}</span>
          </div>
        </div>
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
                {l.label || 'Промо линк'}
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
