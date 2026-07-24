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
        {campaigns.map(c => (
          <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                -{c.customer_discount_pct}% за клиента · {c.commission_pct}% твоя комисионна · {c.clicks} клика
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              Промокод за клиентите: <strong style={{ color: 'var(--text)' }}>{c.promo_code}</strong>
              <button
                className="btn btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => copy(c.promo_code, `code-${c.id}`)}
              >
                {copied === `code-${c.id}` ? '✓' : '📋'}
              </button>
            </div>

            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
              Твоят личен линк за споделяне
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input readOnly value={c.link} onFocus={e => e.target.select()} style={{ flex: 1, fontSize: 12 }} />
              <button className="btn btn-sm btn-primary" onClick={() => copy(c.link, `link-${c.id}`)}>
                {copied === `link-${c.id}` ? '✓ Копирано' : '📋 Копирай'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
              Сподели този линк — клиентът получава -{c.customer_discount_pct}%, а поръчката се засича към теб за комисионна.
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
