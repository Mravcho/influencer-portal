'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

const STATUS = {
  pending:  { label: 'Чакаща',   badge: 'badge-amber' },
  approved: { label: 'Одобрена', badge: 'badge-green' },
  rejected: { label: 'Отказана', badge: 'badge-gray'  },
}

export default function AdminApplications() {
  const router = useRouter()
  const [apps, setApps]       = useState([])
  const [filter, setFilter]   = useState('pending')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const load = () => {
    setLoading(true)
    const url = filter === 'all'
      ? '/api/admin/applications'
      : `/api/admin/applications?status=${filter}`
    fetch(url).then(r => r.json()).then(d => {
      setApps(d.applications || [])
      setLoading(false)
    })
  }

  useEffect(load, [filter]) // eslint-disable-line

  const updateStatus = async (a, status) => {
    let reviewer_notes = a.reviewer_notes || null
    if (status === 'rejected') {
      const note = prompt('Причина за отказа (опц.):', '')
      if (note !== null) reviewer_notes = note || null
    }
    const res = await fetch('/api/admin/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, status, reviewer_notes }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Грешка')
      return
    }
    load()
  }

  const counts = {
    pending:  apps.filter(a => a.status === 'pending').length,
    approved: apps.filter(a => a.status === 'approved').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Заявки за инфлуенсъри</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{counts.pending} чакащи</div>
          </div>
        </div>
      </header>

      <main className="main-container">
        <div className="chip-row" style={{ marginBottom: 14 }}>
          {[
            { key: 'pending',  label: `⏳ Чакащи (${counts.pending})` },
            { key: 'approved', label: `✓ Одобрени` },
            { key: 'rejected', label: `✗ Отказани` },
            { key: 'all',      label: `Всички` },
          ].map(opt => (
            <button
              key={opt.key}
              className={`chip ${filter === opt.key ? 'active' : ''}`}
              onClick={() => setFilter(opt.key)}
            >{opt.label}</button>
          ))}
        </div>

        {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>Зареждане...</p>}

        {!loading && apps.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
            Няма заявки за този филтър
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apps.map(a => {
              const s = STATUS[a.status]
              const isOpen = expandedId === a.id
              return (
                <div key={a.id} className="card" style={{ padding: 14 }}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}
                    onClick={() => setExpandedId(isOpen ? null : a.id)}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{a.full_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {a.email}{a.phone && ` · ${a.phone}`}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {format(new Date(a.created_at), 'd MMM yyyy, HH:mm', { locale: bg })}
                    </div>
                    <span className={`badge ${s.badge}`}>{s.label}</span>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12 }}>
                        {[
                          ['Instagram', a.instagram_url],
                          ['TikTok',    a.tiktok_url],
                          ['Facebook',  a.facebook_url],
                          ['YouTube',   a.youtube_url],
                          ['Друга',     a.other_url],
                        ].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} style={{ background: 'var(--bg)', borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{k}</div>
                            <a href={v} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, wordBreak: 'break-all' }}>{v}</a>
                          </div>
                        ))}
                      </div>

                      {a.motivation && (
                        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                            Мотивация
                          </div>
                          <div style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{a.motivation}</div>
                        </div>
                      )}

                      {a.reviewer_notes && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>
                          Бележка от admin: {a.reviewer_notes}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {a.status === 'pending' && (
                          <>
                            <button
                              className="btn btn-primary"
                              onClick={() => {
                                if (confirm(`Одобри ${a.full_name}? След това отиди в "Добави нов" и създай инфлуенсър с данните му.`)) {
                                  updateStatus(a, 'approved')
                                }
                              }}
                            >✓ Одобри</button>
                            <button
                              className="btn btn-danger"
                              onClick={() => updateStatus(a, 'rejected')}
                            >✗ Откажи</button>
                            <button
                              className="btn"
                              onClick={() => router.push('/admin')}
                              title="Отиди в добави нов"
                            >+ Създай инфлуенсър →</button>
                          </>
                        )}
                        {a.status !== 'pending' && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => updateStatus(a, 'pending')}
                          >↶ Върни в чакащи</button>
                        )}
                        <a
                          className="btn"
                          href={`mailto:${a.email}?subject=Заявка%20за%20инфлуенсър%20в%20RealFood`}
                        >📧 Имейл</a>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
