'use client'
import { useEffect, useRef, useState } from 'react'

// Избор на офис/автомат от списъка на куриера (същия като в количката на магазина,
// идва от middleware.bg). Стойността е точният текст, който middleware-ът очаква:
// „До офис speedy[877]: СОФИЯ - БОРОВО …“.
const LABEL_RE = /^(?:До офис|До автомат)\s+[a-z]+(?:-locker)?\[[^\]]+\]:\s*/

export function isOfficeLabel(value) {
  return LABEL_RE.test(String(value || ''))
}

export default function OfficePicker({ method, value, onChange, placeholder = 'Търси по град, квартал или адрес…', initialQuery = '' }) {
  const [query, setQuery]     = useState(isOfficeLabel(value) ? '' : (initialQuery || value || ''))
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [editing, setEditing] = useState(!isOfficeLabel(value))
  const timer = useRef(null)

  // Смяна на куриера → изчистваме избора
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    setResults([]); setQuery(''); setEditing(true)
  }, [method])

  useEffect(() => {
    if (!editing || !method) return
    clearTimeout(timer.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const res = await fetch(`/api/dashboard/courier-offices?method=${encodeURIComponent(method)}&q=${encodeURIComponent(q)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Грешка')
        setResults(data.offices || [])
      } catch (err) {
        setError(err.message); setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query, method, editing])

  if (!editing && isOfficeLabel(value)) {
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
        borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-lt)', fontSize: 12,
      }}>
        <span style={{ flex: 1, color: 'var(--accent-dk)' }}>✓ {value.replace(LABEL_RE, '')}</span>
        <button
          type="button"
          onClick={() => { setEditing(true); setQuery('') }}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
        >Смени</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={method ? placeholder : 'Първо избери начин на доставка'}
        disabled={!method}
        autoComplete="off"
      />
      {(loading || error || results.length > 0 || query.trim().length >= 2) && (
        <div style={{
          marginTop: 4, maxHeight: 220, overflowY: 'auto', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface, #fff)',
        }}>
          {loading && <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>Търся…</div>}
          {error && <div style={{ padding: 8, fontSize: 12, color: '#991b1b' }}>{error}</div>}
          {!loading && !error && results.length === 0 && query.trim().length >= 2 && (
            <div style={{ padding: 8, fontSize: 12, color: 'var(--muted)' }}>Няма намерени офиси — опитай с града или квартала.</div>
          )}
          {results.map(o => (
            <button
              key={o.label}
              type="button"
              onClick={() => { onChange(o.label); setEditing(false); setResults([]) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent',
                cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'var(--text)',
              }}
            >
              <span style={{ marginRight: 6 }}>{o.locker ? '🗄' : '🏢'}</span>
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
