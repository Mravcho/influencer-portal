'use client'
import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'

export default function FloatingChat() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [sending, setSending]   = useState(false)
  const [unread, setUnread]     = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const endRef = useRef(null)

  // responsive
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // непрочетени — на старт + на всеки 30 сек (когато е затворен)
  const loadUnread = async () => {
    try {
      const r = await fetch('/api/dashboard/chat?count=unread', { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setUnread(d.count || 0) }
    } catch {}
  }
  useEffect(() => {
    loadUnread()
    const id = setInterval(() => { if (!open) loadUnread() }, 30000)
    return () => clearInterval(id)
  }, [open])

  const loadMessages = async () => {
    setLoading(true)
    const r = await fetch('/api/dashboard/chat', { cache: 'no-store' })
    if (r.ok) { const d = await r.json(); setMessages(d.messages || []); setUnread(0) }
    setLoading(false)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) loadMessages()
  }

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    const r = await fetch('/api/dashboard/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    })
    const data = await r.json()
    setSending(false)
    if (r.ok) { setMessages(m => [...m, data]); setText('') }
  }

  const fmt = (iso) => new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Позиция на балончето — над мобилната лента
  const bubbleBottom = isMobile ? 76 : 24

  const panelStyle = isMobile
    ? { position: 'fixed', inset: 0, zIndex: 120, display: 'flex', flexDirection: 'column', background: 'var(--card-bg, #fff)' }
    : { position: 'fixed', right: 24, bottom: 92, zIndex: 120, width: 380, maxWidth: '92vw', height: 560, maxHeight: '75vh',
        display: 'flex', flexDirection: 'column', background: 'var(--card-bg, #fff)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }

  return (
    <>
      {/* Балонче */}
      <button
        onClick={toggle}
        aria-label="Чат с екипа"
        style={{
          position: 'fixed', right: 20, bottom: bubbleBottom, zIndex: 110,
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10,
            background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            border: '2px solid var(--card-bg, #fff)',
          }}>{unread}</span>
        )}
      </button>

      {/* Панел */}
      {open && (
        <div style={panelStyle}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid var(--border)',
            paddingTop: isMobile ? 'max(14px, env(safe-area-inset-top))' : 14,
            flexShrink: 0,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>💬 Чат с екипа</div>
            <button onClick={() => setOpen(false)} aria-label="Затвори"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
            {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Зареждане…</div>}
            {!loading && messages.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Имаш въпрос? Напиши ни — екипът ще ти отговори.</div>
            )}
            {messages.map(m => {
              const mine = m.sender === 'influencer'
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  <div style={{
                    background: mine ? 'var(--accent)' : 'var(--bg)', color: mine ? '#fff' : 'var(--text)',
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

          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)',
            paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 12, flexShrink: 0 }}>
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Напиши съобщение…" rows={1}
              style={{ flex: 1, fontSize: 14, resize: 'none' }}
            />
            <button className="btn btn-primary" onClick={send} disabled={sending || !text.trim()}>
              {sending ? '…' : 'Изпрати'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
