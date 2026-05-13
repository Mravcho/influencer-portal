'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'

// Всички месеци от началото на текущата година до сега (с label "Този месец" за текущия)
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

const MEDAL_EMOJI = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function InfluencerLeaderboard({ viewId = null }) {
  const months = monthsThisYear()
  const [month, setMonth] = useState(months[0].value)
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ month })
    if (viewId) params.set('viewId', viewId)
    fetch(`/api/dashboard/leaderboard?${params.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month, viewId])

  if (loading && !data) return null

  const top10 = data?.top10 || []
  const meOutside = data?.meOutsideTop
  const myRank = data?.myRank
  const totalParticipants = data?.totalParticipants || 0

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            🏆 Класация
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {totalParticipants} участници
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

      {/* Банер с твоето място */}
      {myRank && (
        <div style={{
          background: myRank <= 3
            ? 'linear-gradient(135deg, #fff8e1 0%, #fffce8 100%)'
            : 'var(--accent-lt)',
          border: `1px solid ${myRank <= 3 ? '#fcd34d' : '#9FE1CB'}`,
          borderRadius: 10,
          padding: '10px 14px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            fontSize: 28, fontWeight: 700,
            minWidth: 40, textAlign: 'center',
            color: myRank <= 3 ? '#92400e' : 'var(--accent-dk)',
          }}>
            {MEDAL_EMOJI[myRank] || `#${myRank}`}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {myRank === 1 && 'Ти си на 1-во място! 🎉'}
              {myRank === 2 && 'Ти си на 2-ро място!'}
              {myRank === 3 && 'Ти си на 3-то място!'}
              {myRank > 3   && `Ти си на ${myRank}-то място`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              от {totalParticipants} {totalParticipants === 1 ? 'инфлуенсър' : 'инфлуенсъри'} този месец
            </div>
          </div>
        </div>
      )}

      {top10.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '1rem 0' }}>
          Няма поръчки за този месец
        </p>
      )}

      {/* Списък */}
      {top10.length > 0 && (
        <div>
          {top10.map(r => (
            <LeaderRow key={r.id} row={r} />
          ))}
          {meOutside && (
            <>
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: '4px 0' }}>···</div>
              <LeaderRow row={meOutside} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function LeaderRow({ row }) {
  const medal = MEDAL_EMOJI[row.rank]
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 10px',
      borderRadius: 8,
      background: row.isMe ? 'var(--accent-lt)' : 'transparent',
      border: row.isMe ? '1px solid #9FE1CB' : '1px solid transparent',
      marginBottom: 4,
    }}>
      <div style={{
        minWidth: 32, textAlign: 'center',
        fontSize: medal ? 20 : 13,
        fontWeight: 700,
        color: row.isMe ? 'var(--accent-dk)' : 'var(--muted)',
      }}>
        {medal || `#${row.rank}`}
      </div>
      <div style={{ flex: 1, fontSize: 13, fontWeight: row.isMe ? 700 : 500 }}>
        {row.name}
        {row.isMe && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-dk)' }}>(ти)</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: row.isMe ? 'var(--accent-dk)' : 'var(--text)' }}>
        {row.orders} {row.orders === 1 ? 'поръчка' : 'поръчки'}
      </div>
    </div>
  )
}
