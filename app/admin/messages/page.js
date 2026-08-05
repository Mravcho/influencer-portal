'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from '../components/AdminShell'

export default function AdminMessagesPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState([])
  const [active, setActive]   = useState(null) // influencer object
  const [messages, setMessages] = useState([])
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const endRef = useRef(null)

  const loadList = useCallback(async () => {
    const res = await fetch('/api/admin/messages', { cache: 'no-store' })
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    const d = await res.json()
    setConversations(d.conversations || [])
    setLoadingList(false)
  }, [router])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const openThread = async (conv) => {
    setActive(conv.influencer || { id: conv.influencer_id, name: '—' })
    const res = await fetch(`/api/admin/messages?influencerId=${conv.influencer_id}`, { cache: 'no-store' })
    const d = await res.json()
    setMessages(d.messages || [])
    // нулираме unread локално + опресняваме списъка
    setConversations(cs => cs.map(c => c.influencer_id === conv.influencer_id ? { ...c, unread: 0 } : c))
  }

  const send = async () => {
    const body = text.trim()
    if (!body || !active || sending) return
    setSending(true)
    const res = await fetch('/api/admin/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ influencerId: active.id, body }),
    })
    const data = await res.json()
    setSending(false)
    if (res.ok) { setMessages(m => [...m, data]); setText(''); loadList() }
  }

  const fmt = (iso) => new Date(iso).toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <AdminShell>
      <div className="main-container">
        <div style={{ marginBottom: 16, paddingTop: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>💬 Съобщения</h1>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Чат с инфлуенсърите</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* Разговори */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', maxHeight: '75vh', overflowY: 'auto' }}>
            {loadingList && <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Зареждане…</div>}
            {!loadingList && conversations.length === 0 && (
              <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Още няма съобщения.</div>
            )}
            {conversations.map(c => {
              const isActive = active?.id === c.influencer_id
              return (
                <button
                  key={c.influencer_id}
                  onClick={() => openThread(c)}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                    padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: isActive ? 'var(--accent-lt)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {c.influencer?.avatar_url
                    ? <img src={c.influencer.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(c.influencer?.name || '?').slice(0, 2).toUpperCase()}</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.influencer?.name || '—'}</span>
                      {c.unread > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9, padding: '0 6px', minWidth: 18, textAlign: 'center' }}>{c.unread}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.last?.sender === 'admin' ? 'Ти: ' : ''}{c.last?.body}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Нишка */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 400, maxHeight: '75vh' }}>
            {!active ? (
              <div style={{ margin: 'auto', color: 'var(--muted)', fontSize: 13 }}>Избери разговор отляво.</div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                  {active.name}
                  {active.id && (
                    <button className="btn btn-sm" style={{ marginLeft: 8, background: 'transparent' }}
                      onClick={() => router.push(`/admin/view/${active.id}`)}>профил ↗</button>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                  {messages.map(m => {
                    const admin = m.sender === 'admin'
                    return (
                      <div key={m.id} style={{ alignSelf: admin ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                        <div style={{
                          background: admin ? 'var(--accent)' : 'var(--bg)', color: admin ? '#fff' : 'var(--text)',
                          borderRadius: 12, padding: '8px 12px', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>{m.body}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textAlign: admin ? 'right' : 'left' }}>
                          {admin ? 'Ти' : active.name} · {fmt(m.created_at)}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={endRef} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <textarea
                    value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Отговори…" rows={2} style={{ flex: 1, fontSize: 14, resize: 'vertical' }}
                  />
                  <button className="btn btn-primary" onClick={send} disabled={sending || !text.trim()}>
                    {sending ? '…' : 'Изпрати'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
