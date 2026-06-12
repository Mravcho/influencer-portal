'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'
import AdminShell from '../components/AdminShell'

const STATUS = {
  pending:  { label: 'Чакаща',   badge: 'badge-amber' },
  approved: { label: 'Одобрена', badge: 'badge-green' },
  rejected: { label: 'Отказана', badge: 'badge-gray'  },
}

// Авто-детектира платформата от social link-овете
function detectPlatform(app) {
  if (app.instagram_url) return 'Instagram'
  if (app.tiktok_url)    return 'TikTok'
  if (app.facebook_url)  return 'Facebook'
  if (app.youtube_url)   return 'YouTube'
  return 'Instagram'
}

// Генерира предложение за промо код от името
function suggestCode(name) {
  if (!name) return ''
  const first = name.trim().split(/\s+/)[0] || ''
  return first.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) + '5'
}

export default function AdminApplications() {
  const router = useRouter()
  const [apps, setApps]       = useState([])
  const [filter, setFilter]   = useState('pending')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const [approveApp, setApproveApp]   = useState(null) // application being approved
  const [collections, setCollections] = useState([])
  const [approveForm, setApproveForm] = useState({
    promo_code:        '',
    customer_discount: 5,
    commission:        10,
    platform:          'Instagram',
    collection_id:     '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

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

  // Презареждаме колекциите от Shopify при отваряне на approve modal
  useEffect(() => {
    if (approveApp && collections.length === 0) {
      fetch('/api/admin/collections')
        .then(r => r.json())
        .then(d => setCollections(d.collections || []))
        .catch(() => {})
    }
  }, [approveApp]) // eslint-disable-line

  const openApprove = (a) => {
    setApproveApp(a)
    setApproveForm({
      promo_code:        suggestCode(a.full_name),
      customer_discount: 5,
      commission:        10,
      platform:          detectPlatform(a),
      collection_id:     '',
    })
    setSubmitError('')
  }

  const setApproveField = (k, v) => setApproveForm(f => ({ ...f, [k]: v }))

  const confirmApprove = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    const res = await fetch('/api/admin/applications/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:    approveApp.id,
        promo_code:        approveForm.promo_code,
        customer_discount: parseFloat(approveForm.customer_discount),
        commission:        parseFloat(approveForm.commission),
        platform:          approveForm.platform,
        collection_id:     approveForm.collection_id || null,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) {
      setSubmitError(data.error || 'Грешка')
      return
    }
    setApproveApp(null)
    load()
    alert(`✓ ${data.influencer?.name} е създаден, Shopify код ${data.shopify?.code} е активен. Welcome email е изпратен.`)
  }

  const rejectApp = async (a) => {
    const note = prompt('Причина за отказа (опц.):', '')
    if (note === null) return
    const res = await fetch('/api/admin/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, status: 'rejected', reviewer_notes: note || null }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Грешка')
      return
    }
    load()
  }

  const reopenApp = async (a) => {
    await fetch('/api/admin/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, status: 'pending', reviewer_notes: null }),
    })
    load()
  }

  const counts = {
    pending:  apps.filter(a => a.status === 'pending').length,
    approved: apps.filter(a => a.status === 'approved').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  }

  return (
    <AdminShell>
      <div className="main-container">
        <div style={{ marginBottom: 20, paddingTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>Заявки за инфлуенсъри</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{counts.pending} чакащи</div>
        </div>
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
                            <button className="btn btn-primary" onClick={() => openApprove(a)}>
                              ✓ Одобри и създай
                            </button>
                            <button className="btn btn-danger" onClick={() => rejectApp(a)}>
                              ✗ Откажи
                            </button>
                          </>
                        )}
                        {a.status !== 'pending' && (
                          <button className="btn btn-ghost" onClick={() => reopenApp(a)}>
                            ↶ Върни в чакащи
                          </button>
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

      {/* Approve modal */}
      {approveApp && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: '1rem',
          }}
          onClick={() => !submitting && setApproveApp(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 16, maxWidth: 520,
              width: '100%', maxHeight: '90vh', overflow: 'auto', padding: '1.5rem',
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Одобри {approveApp.full_name}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              Ще създадем промо код в Shopify, инфлуенсърски акаунт и ще изпратим welcome email.
            </p>

            <form onSubmit={confirmApprove} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submitError && <div className="alert alert-error" style={{ marginBottom: 0 }}>{submitError}</div>}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Промо код *</label>
                <input
                  value={approveForm.promo_code}
                  onChange={e => setApproveField('promo_code', e.target.value.toUpperCase())}
                  placeholder="напр. MARIA5"
                  required
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                    Отстъпка за клиента (%)
                  </label>
                  <input
                    type="number" min="0" max="100" step="1"
                    value={approveForm.customer_discount}
                    onChange={e => setApproveField('customer_discount', e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                    Комисионна (%)
                  </label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={approveForm.commission}
                    onChange={e => setApproveField('commission', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Платформа</label>
                <select
                  value={approveForm.platform}
                  onChange={e => setApproveField('platform', e.target.value)}
                >
                  {['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Друга'].map(p => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                  Shopify колекция (за която важи кодът)
                </label>
                <select
                  value={approveForm.collection_id}
                  onChange={e => setApproveField('collection_id', e.target.value)}
                >
                  <option value="">— Всички продукти (без ограничение) —</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                {collections.length === 0 && (
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    Зареждам колекциите от Shopify...
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Създаване... (до 30 сек)' : '✓ Одобри и създай всичко'}
                </button>
                <button
                  type="button" className="btn"
                  onClick={() => setApproveApp(null)}
                  disabled={submitting}
                >Отказ</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </AdminShell>
  )
}
