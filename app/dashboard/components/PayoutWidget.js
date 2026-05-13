'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

const STATUS_LABEL = {
  pending:  { label: 'В очакване',  badge: 'badge-amber' },
  approved: { label: 'Одобрена',    badge: 'badge-blue'  },
  paid:     { label: 'Изплатена',   badge: 'badge-green' },
  rejected: { label: 'Отказана',    badge: 'badge-gray'  },
}

export default function PayoutWidget({ viewId = null }) {
  const [data, setData]     = useState(null)
  const [amount, setAmount] = useState('')
  const [notes, setNotes]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState('')

  const load = () => {
    const url = viewId
      ? `/api/dashboard/payouts?viewId=${viewId}`
      : '/api/dashboard/payouts'
    fetch(url).then(r => r.json()).then(setData).catch(() => {})
  }

  useEffect(() => { load() }, [viewId])

  if (!data) return null
  const { balance, payouts } = data
  const canRequest = balance.available >= balance.minPayout

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const res = await fetch('/api/dashboard/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(amount), notes: notes || null }),
    })
    const d = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(d.error || 'Грешка'); return }
    setShowForm(false)
    setAmount('')
    setNotes('')
    load()
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            💰 Изплащане
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 2, color: 'var(--accent)' }}>
            {fmtEur(balance.available)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            налично за теглене
            {balance.reserved > 0 && (
              <> · резервирано: <strong>{fmtEur(balance.reserved)}</strong></>
            )}
          </div>
        </div>

        {!viewId && (
          canRequest ? (
            <button
              className="btn btn-primary"
              onClick={() => setShowForm(s => !s)}
            >
              {showForm ? 'Отказ' : '💸 Заяви изплащане'}
            </button>
          ) : (
            <div style={{
              padding: '8px 12px', background: 'var(--bg)', borderRadius: 8,
              fontSize: 12, color: 'var(--muted)', maxWidth: 240,
            }}>
              Минимална сума за заявка: <strong>{fmtEur(balance.minPayout)}</strong>.
              Имаш още <strong>{fmtEur(balance.minPayout - balance.available)}</strong> до достигането ѝ.
            </div>
          )
        )}
      </div>

      {showForm && !viewId && (
        <form onSubmit={submit} style={{
          padding: 14, background: 'var(--bg)', borderRadius: 10, marginBottom: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Сума за теглене (€) — макс {fmtEur(balance.available)}, мин {fmtEur(balance.minPayout)}
            </label>
            <input
              type="number" step="0.01" min={balance.minPayout} max={balance.available}
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={String(balance.available)}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Бележка (опционално)
            </label>
            <input
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="напр. IBAN или коментар за администратора"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Изпращане...' : 'Изпрати заявка'}
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Отказ</button>
          </div>
        </form>
      )}

      {payouts.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            История на заявки
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {payouts.map(p => {
              const s = STATUS_LABEL[p.status] || STATUS_LABEL.pending
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 8,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtEur(p.amount)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {format(new Date(p.requested_at), 'd MMM yyyy, HH:mm', { locale: bg })}
                      {p.processed_at && (
                        <> · обработена: {format(new Date(p.processed_at), 'd MMM', { locale: bg })}</>
                      )}
                    </div>
                    {p.admin_notes && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>
                        Admin: {p.admin_notes}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${s.badge}`}>{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
