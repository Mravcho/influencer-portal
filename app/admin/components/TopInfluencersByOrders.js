'use client'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { bg } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

const fmtEur = (n) => `${Number(n || 0).toFixed(2)} €`

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TopInfluencersByOrders({ limit = 10 }) {
  const router = useRouter()
  const now = new Date()
  const monthLabel = format(now, 'LLLL yyyy', { locale: bg })
  const monthKey = ymd(now)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/leaderboard?month=${monthKey}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [monthKey])

  const ranking = (data?.ranking || []).slice(0, limit)

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}>
            🏆 Топ инфлуенсъри по поръчки за месеца
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, textTransform: 'capitalize' }}>
            {monthLabel}
          </div>
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '1rem 0' }}>Зареждане...</p>
      )}

      {!loading && ranking.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13, padding: '1rem 0' }}>Няма поръчки за този месец.</p>
      )}

      {!loading && ranking.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ranking.map((r, i) => (
            <button
              key={r.id}
              onClick={() => router.push(`/admin/view/${r.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                color: 'inherit',
                transition: 'border-color .15s ease, background .15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent' }}
            >
              <div style={{
                width: 28, textAlign: 'center',
                fontSize: 16, fontWeight: 700,
                color: i < 3 ? 'var(--accent-dk)' : 'var(--muted)',
              }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </div>

              {r.avatar_url ? (
                <img
                  src={r.avatar_url}
                  alt={r.name}
                  style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'var(--accent-lt)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: 'var(--accent-dk)',
                  flexShrink: 0,
                }}>{(r.name || '?').slice(0, 2).toUpperCase()}</div>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {r.platform} · <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>{r.promo_code}</code>
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 80, flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{r.orders} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>{r.orders === 1 ? 'поръчка' : 'поръчки'}</span></div>
                <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{fmtEur(r.commission)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
