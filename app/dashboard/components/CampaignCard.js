'use client'
import { useEffect, useState } from 'react'

export default function CampaignCard({ viewId = null }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading]     = useState(true)
  const [copied, setCopied]       = useState('')

  useEffect(() => {
    const url = viewId ? `/api/dashboard/campaign?viewId=${viewId}` : '/api/dashboard/campaign'
    fetch(url)
      .then(r => r.ok ? r.json() : { campaigns: [] })
      .then(d => setCampaigns(d.campaigns || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [viewId])

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch {}
  }

  if (loading || campaigns.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: '1rem', border: '1px solid #c7d2fe', background: '#eef2ff' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
        📣 Кампания
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {campaigns.map(c => {
          const inactive = c.active === false
          return (
          <div key={c.id} style={{
            background: '#fff', borderRadius: 12, padding: 14,
            opacity: inactive ? 0.6 : 1,
            filter: inactive ? 'grayscale(1)' : 'none',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                -{c.customer_discount_pct}% за клиента · {c.commission_pct}% твоя комисионна
              </div>
            </div>

            {inactive && (
              <div style={{
                background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8,
                padding: '8px 12px', marginBottom: 10, fontSize: 13, color: '#4b5563', fontWeight: 600,
              }}>
                ⏸ Тази кампания е изтекла и вече не е активна.
              </div>
            )}

            {/* Резултати от кампанията за инфлуенсъра */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 90, background: '#eef2ff', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: '#3730a3' }}>Клика</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#3730a3' }}>{c.clicks}</div>
              </div>
              <div style={{ flex: 1, minWidth: 90, background: '#eef2ff', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: '#3730a3' }}>Поръчки</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#3730a3' }}>{c.orders ?? 0}</div>
              </div>
              <div style={{ flex: 1, minWidth: 110, background: '#dcfce7', borderRadius: 10, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>Твоя комисионна</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{(c.commission ?? 0).toFixed(2)} €</div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              Промокод за клиентите: <strong style={{ color: 'var(--text)' }}>{c.promo_code}</strong>
              {!inactive && (
                <button
                  className="btn btn-sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => copy(c.promo_code, `code-${c.id}`)}
                >
                  {copied === `code-${c.id}` ? '✓' : '📋'}
                </button>
              )}
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Твоят личен линк за споделяне
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input readOnly disabled={inactive} value={c.link} onFocus={e => !inactive && e.target.select()} style={{ flex: 1, fontSize: 12 }} />
              <button
                className="btn btn-sm btn-primary"
                onClick={() => copy(c.link, `link-${c.id}`)}
                disabled={inactive}
                style={inactive ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                {copied === `link-${c.id}` ? '✓ Копирано' : '📋 Копирай'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              {inactive
                ? 'Кампанията е приключила — линкът вече не носи отстъпка/комисионна.'
                : `Сподели този линк — клиентът получава -${c.customer_discount_pct}%, а поръчката се засича към теб за комисионна.`}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
