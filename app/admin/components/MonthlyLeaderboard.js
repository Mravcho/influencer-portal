'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

// Всички месеци от началото на текущата година до сега
function monthsThisYear() {
  const now = new Date()
  const year = now.getFullYear()
  const currentMonthIdx = now.getMonth()
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const out = []
  for (let m = currentMonthIdx; m >= 0; m--) {
    const d = new Date(year, m, 1)
    let label = format(d, 'LLLL yyyy', { locale: bg })
    if (m === currentMonthIdx)     label = `Този месец (${format(d, 'LLLL', { locale: bg })})`
    else if (m === currentMonthIdx - 1) label = `Минал месец (${format(d, 'LLLL', { locale: bg })})`
    out.push({ value: fmt(d), label })
  }
  return out
}

const MEDAL = {
  1: { emoji: '🥇', bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', text: '#7c4a00' },
  2: { emoji: '🥈', bg: 'linear-gradient(135deg, #E5E5E5 0%, #B8B8B8 100%)', text: '#444' },
  3: { emoji: '🥉', bg: 'linear-gradient(135deg, #CD7F32 0%, #A0522D 100%)', text: '#fff' },
}

export default function MonthlyLeaderboard() {
  const months = monthsThisYear()
  const [month, setMonth] = useState(months[0].value)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/leaderboard?month=${month}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month])

  const ranking = data?.ranking || []
  const totals  = data?.totals  || {}

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            🏆 Класация за месеца
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {totals.influencers || 0} активни инфлуенсъри · {totals.orders || 0} поръчки · общо комисионни <strong style={{ color: 'var(--accent)' }}>{fmtEur(totals.commission)}</strong>
          </div>
        </div>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ width: 'auto', fontSize: 12, padding: '5px 10px' }}
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {loading && !data && (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '1rem' }}>Зареждане...</p>
      )}

      {!loading && ranking.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '1rem' }}>
          Няма поръчки за този месец
        </p>
      )}

      {ranking.length > 0 && (
        <>
          {/* Топ 3 — карти */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: ranking.length >= 3 ? 'repeat(3, 1fr)' : `repeat(${ranking.length}, 1fr)`,
            gap: 12,
            marginBottom: ranking.length > 3 ? 20 : 0,
          }}>
            {ranking.slice(0, 3).map(r => {
              const medal = MEDAL[r.rank]
              return (
                <div key={r.id} style={{
                  position: 'relative',
                  padding: '14px 14px 12px',
                  borderRadius: 12,
                  background: r.rank === 1 ? 'linear-gradient(135deg, #fff8e1 0%, #fffce8 100%)'
                            : r.rank === 2 ? 'linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%)'
                            : 'linear-gradient(135deg, #fbecdc 0%, #fdf3e7 100%)',
                  border: `1px solid ${r.rank === 1 ? '#fcd34d' : r.rank === 2 ? '#d4d4d4' : '#deb887'}`,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 8, right: 10,
                    fontSize: 24, lineHeight: 1,
                  }}>{medal.emoji}</div>

                  <div style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: medal.bg,
                    color: medal.text,
                    borderRadius: 12,
                    fontSize: 10,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}>
                    {r.rank === 1 ? '1-ВО МЯСТО' : r.rank === 2 ? '2-РО МЯСТО' : '3-ТО МЯСТО'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt={r.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'var(--accent-lt)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: 'var(--accent-dk)',
                        flexShrink: 0,
                      }}>{r.name?.slice(0, 2).toUpperCase()}</div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {r.platform} · <code style={{ background: 'rgba(0,0,0,.06)', padding: '1px 5px', borderRadius: 4 }}>{r.promo_code}</code>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <div>
                      <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>Поръчки</div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{r.orders}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 600 }}>Комисионна</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>{fmtEur(r.commission)}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Останалите 4-10 — таблица */}
          {ranking.length > 3 && (
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Инфлуенсър</th>
                  <th style={{ textAlign: 'right' }}>Поръчки</th>
                  <th style={{ textAlign: 'right' }}>Приход</th>
                  <th style={{ textAlign: 'right' }}>Комисионна</th>
                </tr>
              </thead>
              <tbody>
                {ranking.slice(3, 10).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: 'var(--muted)' }}>{r.rank}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {r.avatar_url ? (
                          <img src={r.avatar_url} alt={r.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'var(--accent-lt)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, color: 'var(--accent-dk)',
                          }}>{r.name?.slice(0, 2).toUpperCase()}</div>
                        )}
                        <div>
                          <div style={{ fontWeight: 500 }}>{r.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.promo_code}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{r.orders}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmtEur(r.revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{fmtEur(r.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
