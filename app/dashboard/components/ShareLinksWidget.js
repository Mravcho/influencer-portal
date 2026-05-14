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
  const [showForm, setShowForm] = useState(false)
  const [newPath, setNewPath] = useState('/collections/')
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError]     = useState('')

  const linksUrl  = viewId ? `/api/dashboard/links?viewId=${viewId}`  : '/api/dashboard/links'
  const clicksUrl = viewId ? `/api/dashboard/clicks?days=90&viewId=${viewId}` : '/api/dashboard/clicks?days=90'

  const portalBase = useMemo(() => {
    if (baseUrl) return baseUrl
    if (typeof window !== 'undefined') return window.location.origin
    return ''
  }, [baseUrl])

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch(linksUrl).then(r => r.json()),
      fetch(clicksUrl).then(r => r.json()),
    ]).then(([linksRes, statsRes]) => {
      setLinks(linksRes.links || [])
      setStats(statsRes)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(load, [viewId]) // eslint-disable-line

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

  const createLink = async (e) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    const res = await fetch('/api/dashboard/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_path: newPath, label: newLabel }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setError(data.error || 'Грешка'); return }
    setShowForm(false)
    setNewPath('/collections/')
    setNewLabel('')
    load()
  }

  const deleteLink = async (id) => {
    if (!confirm('Изтрий този линк?')) return
    const res = await fetch(`/api/dashboard/links?id=${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  if (loading) return null

  const totalClicks = stats?.total || 0

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            🔗 Споделяеми линкове
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>
            {totalClicks} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted)' }}>клика (90 дни)</span>
          </div>
        </div>
        {!viewId && (
          <button className="btn btn-sm" onClick={() => setShowForm(s => !s)}>
            {showForm ? 'Отказ' : '+ Нов линк за колекция'}
          </button>
        )}
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

      {/* Форма за нов линк */}
      {showForm && !viewId && (
        <form onSubmit={createLink} style={{ padding: 12, background: 'var(--bg)', borderRadius: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Път (path) в магазина</label>
            <input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="/collections/some-collection"
            />
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              напр. <code>/collections/диети</code> или <code>/products/прах-за-смути</code>
            </p>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Етикет (за вътрешна употреба)</label>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="напр. Диети, Story 12 май..."
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Създаване...' : 'Създай линк'}
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Отказ</button>
          </div>
        </form>
      )}

      {/* Списък с линкове */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map(l => (
          <div key={l.id} style={{
            padding: 12, background: l.is_default ? 'var(--accent-lt)' : 'var(--bg)',
            border: `1px solid ${l.is_default ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {l.label || (l.is_default ? 'Главна страница' : 'Линк')}
                {l.is_default && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-dk)' }}>(default)</span>}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{l.clicks}</strong> {l.clicks === 1 ? 'клик' : 'клика'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <code style={{
                flex: 1, minWidth: 0, fontSize: 12, padding: '6px 10px',
                background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
                fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>{fullUrl(l.short_code)}</code>
              <button
                className="btn btn-sm"
                onClick={() => copy(l.short_code, l.id)}
                style={{ minWidth: 80 }}
              >
                {copiedId === l.id ? '✓ Копирано' : '📋 Копирай'}
              </button>
              {!l.is_default && !viewId && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => deleteLink(l.id)}
                  title="Изтрий"
                >🗑</button>
              )}
            </div>

            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
              → <span style={{ wordBreak: 'break-all' }}>{l.target_url}</span>
            </div>
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
