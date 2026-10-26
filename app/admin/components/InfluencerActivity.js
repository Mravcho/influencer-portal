'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// Таб „Активност“ в Админ → Инфлуенсъри: кой продава, кой само носи трафик,
// кой само влиза в портала и кой е напълно неактивен за избрания период.

const STATUS = {
  selling:  { label: 'Продава',        icon: '🟢', color: '#166534', bg: '#dcfce7', hint: 'има поръчки с кода' },
  traffic:  { label: 'Само трафик',    icon: '🟡', color: '#854d0e', bg: '#fef9c3', hint: 'кликове по линка, без поръчки' },
  login:    { label: 'Само влиза',     icon: '🟠', color: '#9a3412', bg: '#ffedd5', hint: 'влиза в портала, без кликове и поръчки' },
  inactive: { label: 'Неактивен',      icon: '🔴', color: '#991b1b', bg: '#fee2e2', hint: 'нито поръчки, нито кликове, нито влизания' },
}
const ORDER = ['inactive', 'login', 'traffic', 'selling']
const PERIODS = [7, 30, 60, 90, 180]
const CATEGORY_LABEL = { influencers: 'Инфлуенсър', partners: 'Партньор', cosmetics: 'Козметик' }

function ago(iso) {
  if (!iso) return 'никога'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d <= 0) return 'днес'
  if (d === 1) return 'вчера'
  if (d < 60) return `преди ${d} дни`
  const m = Math.round(d / 30)
  return m < 12 ? `преди ${m} мес.` : `преди ${Math.round(d / 365)} г.`
}

export default function InfluencerActivity() {
  const [days, setDays]       = useState(30)
  const [data, setData]       = useState(null)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState('all')
  const [showDisabled, setShowDisabled] = useState(false)

  useEffect(() => {
    setData(null); setError('')
    fetch(`/api/admin/influencers/activity?days=${days}`, { cache: 'no-store' })
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || r.status); return d }))
      .then(setData)
      .catch(err => setError(err.message))
  }, [days])

  const rows = useMemo(() => (data?.rows || []).filter(r => showDisabled || r.account_active), [data, showDisabled])
  const counts = useMemo(() => {
    const c = { selling: 0, traffic: 0, login: 0, inactive: 0 }
    rows.forEach(r => { c[r.status]++ })
    return c
  }, [rows])
  const visible = useMemo(() => rows
    .filter(r => filter === 'all' || r.status === filter)
    .sort((a, b) =>
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
      String(a.lastActivityAt || '').localeCompare(String(b.lastActivityAt || '')) ||
      a.name.localeCompare(b.name, 'bg')),
  [rows, filter])

  const activeShare = rows.length ? Math.round(((counts.selling + counts.traffic) / rows.length) * 100) : 0

  return (
    <div>
      {/* Период */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Период:</span>
        {PERIODS.map(p => (
          <button key={p} className={`chip ${days === p ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setDays(p)}>
            {p} дни
          </button>
        ))}
        <label style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showDisabled} onChange={e => setShowDisabled(e.target.checked)} />
          покажи и деактивираните акаунти
        </label>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>⟳ Зареждане…</div>}

      {data && (
        <>
          {/* Обобщение */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <button
              className="card"
              onClick={() => setFilter('all')}
              style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', outline: filter === 'all' ? '2px solid var(--accent)' : 'none' }}
            >
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Активни</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{counts.selling + counts.traffic} <span style={{ fontSize: 14, color: 'var(--muted)' }}>/ {rows.length}</span></div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{activeShare}% продават или носят трафик</div>
            </button>
            {['selling', 'traffic', 'login', 'inactive'].map(k => (
              <button
                key={k}
                className="card"
                onClick={() => setFilter(f => f === k ? 'all' : k)}
                title={STATUS[k].hint}
                style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', outline: filter === k ? `2px solid ${STATUS[k].color}` : 'none' }}
              >
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{STATUS[k].icon} {STATUS[k].label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: STATUS[k].color }}>{counts[k]}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{STATUS[k].hint}</div>
              </button>
            ))}
          </div>

          {/* Таблица */}
          <div className="card table-wrap">
            <table style={{ fontSize: 12 }}>
              <thead><tr>
                <th>Инфлуенсър</th>
                <th>Статус</th>
                <th style={{ textAlign: 'right' }}>Поръчки</th>
                <th style={{ textAlign: 'right' }}>Кликове</th>
                <th style={{ textAlign: 'right' }}>Влизания</th>
                <th>Последна поръчка</th>
                <th>Последен клик</th>
                <th>Последно влизане</th>
              </tr></thead>
              <tbody>
                {visible.map(r => {
                  const s = STATUS[r.status]
                  return (
                    <tr key={r.id} style={{ opacity: r.account_active ? 1 : 0.55 }}>
                      <td style={{ padding: '8px 6px' }}>
                        <Link href={`/admin/view/${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}>
                          {r.avatar_url
                            ? <img src={r.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{(r.name || '?').slice(0, 2).toUpperCase()}</div>}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{r.name}{!r.account_active && ' (деактивиран)'}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                              {r.promo_code || 'без код'} · {CATEGORY_LABEL[r.category] || r.category}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: s.bg, color: s.color, fontWeight: 600, fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
                          {s.icon} {s.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: r.orders ? 700 : 400 }}>{r.orders}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: r.clicks ? 700 : 400 }}>{r.clicks}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: r.logins ? 700 : 400 }}>{r.logins}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ago(r.lastOrderAt)}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ago(r.lastClickAt)}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{ago(r.lastLoginAt)}</td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 16, color: 'var(--muted)' }}>Няма инфлуенсъри в тази група.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Поръчки, кликове и влизания са за последните {days} дни (без анулирани поръчки и без повторни кликове от един адрес до 30 мин).
            „Последно“ е за цялото време.
          </p>
        </>
      )}
    </div>
  )
}
