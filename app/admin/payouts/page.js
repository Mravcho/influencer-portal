'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

const STATUS = {
  pending:  { label: 'В очакване', badge: 'badge-amber' },
  approved: { label: 'Одобрена',   badge: 'badge-blue'  },
  paid:     { label: 'Изплатена',  badge: 'badge-green' },
  rejected: { label: 'Отказана',   badge: 'badge-gray'  },
}

export default function AdminPayouts() {
  const router = useRouter()
  const [payouts, setPayouts] = useState([])
  const [filter, setFilter]   = useState('all')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    const url = filter === 'all'
      ? '/api/admin/payouts'
      : `/api/admin/payouts?status=${filter}`
    fetch(url).then(r => r.json()).then(d => {
      setPayouts(d.payouts || [])
      setLoading(false)
    })
  }

  useEffect(load, [filter]) // eslint-disable-line

  const updateStatus = async (p, status) => {
    let admin_notes = p.admin_notes || null
    if (status === 'rejected' || status === 'paid') {
      const note = prompt(
        status === 'rejected'
          ? 'Причина за отказа (опц.):'
          : 'Бележка (опц.) — напр. дата на превода:',
        ''
      )
      if (note !== null) admin_notes = note || null
    }

    const res = await fetch('/api/admin/payouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, status, admin_notes }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Грешка')
      return
    }
    load()
  }

  const counts = {
    pending:  payouts.filter(p => p.status === 'pending').length,
    approved: payouts.filter(p => p.status === 'approved').length,
    paid:     payouts.filter(p => p.status === 'paid').length,
    rejected: payouts.filter(p => p.status === 'rejected').length,
  }
  const totalPending = payouts
    .filter(p => p.status === 'pending')
    .reduce((s, p) => s + parseFloat(p.amount), 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => router.push('/admin')}>← Назад</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Заявки за изплащане</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {counts.pending} в очакване · общо {fmtEur(totalPending)}
            </div>
          </div>
        </div>
      </header>

      <main className="main-container">
        <div className="chip-row" style={{ marginBottom: 14 }}>
          {[
            { key: 'all',      label: `Всички (${payouts.length})` },
            { key: 'pending',  label: `⏳ В очакване` },
            { key: 'approved', label: `✓ Одобрени`   },
            { key: 'paid',     label: `💸 Изплатени` },
            { key: 'rejected', label: `✗ Отказани`   },
          ].map(opt => (
            <button
              key={opt.key}
              className={`chip ${filter === opt.key ? 'active' : ''}`}
              onClick={() => setFilter(opt.key)}
            >{opt.label}</button>
          ))}
        </div>

        {loading && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem' }}>Зареждане...</p>}

        {!loading && payouts.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
            Няма заявки за този филтър
          </div>
        )}

        {!loading && payouts.length > 0 && (
          <div className="card table-cards">
            <table style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Инфлуенсър</th>
                  <th>Сума</th>
                  <th>Заявка</th>
                  <th>Фактура</th>
                  <th>Бележка</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => {
                  const inf = p.influencer
                  const s = STATUS[p.status]
                  return (
                    <tr key={p.id}>
                      <td data-label="Инфлуенсър">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {inf?.avatar_url ? (
                            <img src={inf.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'var(--accent-lt)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: 'var(--accent-dk)',
                            }}>{inf?.name?.slice(0, 2).toUpperCase()}</div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500 }}>{inf?.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{inf?.email || inf?.username}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Сума" style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtEur(p.amount)}</td>
                      <td data-label="Заявка" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        <div>{format(new Date(p.requested_at), 'd MMM yyyy', { locale: bg })}</div>
                        <div style={{ color: 'var(--muted)' }}>{format(new Date(p.requested_at), 'HH:mm', { locale: bg })}</div>
                      </td>
                      <td data-label="Фактура" style={{ fontSize: 12 }}>
                        {p.invoice_url ? (
                          <a
                            href={p.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              color: 'var(--accent)', fontWeight: 600,
                            }}
                          >📎 {p.invoice_filename ? (p.invoice_filename.length > 18 ? p.invoice_filename.slice(0, 15) + '...' : p.invoice_filename) : 'Виж'}</a>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: 11 }}>— стара заявка</span>
                        )}
                      </td>
                      <td data-label="Бележка" style={{ fontSize: 11, maxWidth: 200 }}>
                        {p.notes && <div>{p.notes}</div>}
                        {p.admin_notes && (
                          <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                            Admin: {p.admin_notes}
                          </div>
                        )}
                      </td>
                      <td data-label="Статус">
                        <span className={`badge ${s.badge}`}>{s.label}</span>
                      </td>
                      <td data-label="Действие">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {p.status === 'pending' && (
                            <>
                              <button className="btn btn-sm" onClick={() => updateStatus(p, 'approved')} title="Одобри">✓</button>
                              <button className="btn btn-sm" onClick={() => updateStatus(p, 'paid')} title="Маркирай като изплатена">💸</button>
                              <button className="btn btn-sm btn-danger" onClick={() => updateStatus(p, 'rejected')} title="Откажи">✗</button>
                            </>
                          )}
                          {p.status === 'approved' && (
                            <>
                              <button className="btn btn-sm" onClick={() => updateStatus(p, 'paid')} title="Маркирай като изплатена">💸 Платена</button>
                              <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(p, 'pending')}>↶</button>
                            </>
                          )}
                          {(p.status === 'paid' || p.status === 'rejected') && (
                            <button className="btn btn-sm btn-ghost" onClick={() => updateStatus(p, 'pending')} title="Върни в чакащи">↶</button>
                          )}
                        </div>
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
