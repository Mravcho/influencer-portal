'use client'
import { useEffect, useRef, useState } from 'react'

export default function ChatWidget() {
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const endRef = useRef(null)

  const load = async () => {
    const res = await fetch('/api/dashboard/chat', { cache: 'no-store' })
    if (res.ok) { const d = await res.json(); setMessages(d.messages || []) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const res = await fetch('/api/dashboard/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    })
    const data = await res.json()
    setSending(false)
    if (res.ok) { setMessages(m => [...m, data]); setText('') }
  }

  const fmt = (iso) => new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
        💬 Чат с екипа
      </div>

      <div style={{
        maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
        padding: 4, marginBottom: 12,
      }}>
        {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Зареждане…</div>}
        {!loading && messages.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>
            Имаш въпрос? Напиши ни тук — екипът ще ти отговори.
          </div>
        )}
        {messages.map(m => {
          const mine = m.sender === 'influencer'
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{
                background: mine ? 'var(--accent)' : 'var(--bg)',
                color: mine ? '#fff' : 'var(--text)',
                borderRadius: 12, padding: '8px 12px', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{m.body}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
                {mine ? 'Ти' : 'Екип RealFood'} · {fmt(m.created_at)}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Напиши съобщение…"
          rows={2}
          style={{ flex: 1, fontSize: 14, resize: 'vertical' }}
        />
        <button className="btn btn-primary" onClick={send} disabled={sending || !text.trim()}>
          {sending ? '…' : 'Изпрати'}
        </button>
      </div>
    </div>
  )
}
