'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { bg } from 'date-fns/locale'

function fmtDuration(seconds) {
  if (!seconds || seconds < 0) return '—'
  if (seconds < 60) return `${seconds}с`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return `${m}м ${s}с`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}ч ${mm}м`
}

function shortDevice(ua) {
  if (!ua) return '—'
  if (/iphone|ipad/i.test(ua))   return '📱 iPhone/iPad'
  if (/android/i.test(ua))       return '📱 Android'
  if (/macintosh|mac os/i.test(ua)) return '💻 Mac'
  if (/windows/i.test(ua))       return '💻 Windows'
  if (/linux/i.test(ua))         return '💻 Linux'
  return '💻 Друго'
}

function browser(ua) {
  if (!ua) return ''
  if (/edg/i.test(ua))     return 'Edge'
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) return 'Chrome'
  if (/firefox/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari'
  return ''
}

function failureLabel(reason) {
  switch (reason) {
    case 'wrong_password': return 'Грешна парола'
    case 'no_such_user':   return 'Няма такъв user'
    case 'inactive':       return 'Деактивиран'
    default:               return 'Неуспех'
  }
}

export default function SessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState([])
  const [influencers, setInfluencers] = useState([])
  const [filter, setFilter] = useState('')
  const [showOnly, setShowOnly] = useState('all') // all | success | failed
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/influencers')
      .then(r => r.json())
      .then(d => setInfluencers(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = filter ? `/api/admin/sessions?influencer_id=${filter}` : '/api/admin/sessions'
    fetch(url)
      .then(r => r.json())
      .then(d => { setSessions(d.sessions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filter])

  const filtered = sessions.filter(s => {
    if (showOnly === 'success') return s.success !== false
    if (showOnly === 'failed')  return s.success === false
    return true
  })
  const failedCount = sessions.filter(s => s.success === false).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Сесии</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>История на влизанията</div>
          </div>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ width: 'auto', fontSize: 12, padding: '5px 10px', maxWidth: 220 }}
        >
          <option value="">Всички инфлуенсъри</option>
          {influencers.map(i => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </header>

      <main className="main-container">
        {/* Филтър успешни / неуспешни */}
        <div className="chip-row" style={{ marginBottom: 14 }}>
          {[
            { key: 'all',     label: `Всички (${sessions.length})` },
            { key: 'success', label: `✓ Успешни (${sessions.length - failedCount})` },
            { key: 'failed',  label: `✗ Неуспешни (${failedCount})` },
          ].map(opt => (
            <button
              key={opt.key}
              className={`chip ${showOnly === opt.key ? 'active' : ''}`}
              onClick={() => setShowOnly(opt.key)}
            >{opt.label}</button>
          ))}
        </div>

        {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>Зареждане...</p>}

        {!loading && filtered.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
            {sessions.length === 0 ? 'Няма записани сесии' : 'Няма резултати за този филтър'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="card table-cards">
            <table style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Инфлуенсър</th>
                  <th>Влизане</th>
                  <th>Продължителност</th>
                  <th>Локация</th>
                  <th>Устройство</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const inf = s.influencers
                  const failed = s.success === false
                  return (
                    <tr key={s.id} style={failed ? { background: '#fff5f5' } : {}}>
                      <td data-label="Инфлуенсър">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {inf?.avatar_url ? (
                            <img src={inf.avatar_url} alt={inf.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: failed ? '#fecaca' : 'var(--accent-lt)',
                              display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700,
                              color: failed ? '#991b1b' : 'var(--accent-dk)',
                            }}>{(inf?.name || s.attempted_username || '?').slice(0, 2).toUpperCase()}</div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {inf?.name || <span style={{ color: '#991b1b' }}>«{s.attempted_username}»</span>}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                              {inf?.username || (failed && 'неизвестно име')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Влизане" style={{ whiteSpace: 'nowrap' }}>
                        <div>{format(new Date(s.login_at), 'd MMM yyyy', { locale: bg })}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {format(new Date(s.login_at), 'HH:mm', { locale: bg })}
                          {' · '}
                          {formatDistanceToNow(new Date(s.login_at), { addSuffix: true, locale: bg })}
                        </div>
                      </td>
                      <td data-label="Продълж." style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {failed ? '—' : fmtDuration(s.duration_seconds)}
                      </td>
                      <td data-label="Локация" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        {s.city || s.country ? (
                          <div>
                            <div>{[s.city, s.country].filter(Boolean).join(', ')}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{s.ip_address || '—'}</div>
                          </div>
                        ) : (
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{s.ip_address || '—'}</div>
                        )}
                      </td>
                      <td data-label="Устройство" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                        <div>{shortDevice(s.user_agent)}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{browser(s.user_agent)}</div>
                      </td>
                      <td data-label="Статус">
                        {failed ? (
                          <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>
                            ❌ {failureLabel(s.failure_reason)}
                          </span>
                        ) : s.is_active ? (
                          <span className="badge badge-green">🟢 Активен</span>
                        ) : s.logout_at ? (
                          <span className="badge badge-gray">Излязъл</span>
                        ) : (
                          <span className="badge badge-amber">Прекратил</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
