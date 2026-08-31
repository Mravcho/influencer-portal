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

  // Композитор за ново съобщение (индивидуално или масово)
  const [composing, setComposing] = useState(false)
  const [recipients, setRecipients] = useState([])
  const [audience, setAudience] = useState('active')  // 'active' | 'all' | 'picked'
  const [picked, setPicked] = useState([])            // id-та при audience === 'picked'
  const [pickQuery, setPickQuery] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkMsg, setBulkMsg] = useState(null)

  const loadList = useCallback(async () => {
    const res = await fetch('/api/admin/messages', { cache: 'no-store' })
    if (res.status === 401 || res.status === 403) { router.push('/login'); return }
    const d = await res.json()
    setConversations(d.conversations || [])
    setLoadingList(false)
  }, [router])

  useEffect(() => { loadList() }, [loadList])

  // /admin/messages?to=<id> → отваря композитора с този инфлуенсър избран
  // (бутонът ✉ от списъка с инфлуенсъри). Четем от location, за да не
  // въвеждаме Suspense граница заради useSearchParams.
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get('to')
    if (!to) return
    setAudience('picked')
    setPicked([to])
    setComposing(true)
  }, [])

  // Списъкът с получатели се тегли веднъж, при отваряне на композитора
  useEffect(() => {
    if (!composing || recipients.length) return
    fetch('/api/admin/messages?list=recipients', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setRecipients(d.influencers || []))
      .catch(() => {})
  }, [composing, recipients.length])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const openThread = async (conv) => {
    setComposing(false)
    setActive(conv.influencer || { id: conv.influencer_id, name: '—' })
    const res = await fetch(`/api/admin/messages?influencerId=${conv.influencer_id}`, { cache: 'no-store' })
    const d = await res.json()
    setMessages(d.messages || [])
    // нулираме unread локално + опресняваме списъка
    setConversations(cs => cs.map(c => c.influencer_id === conv.influencer_id ? { ...c, unread: 0 } : c))
  }

  const openCompose = (influencer = null) => {
    setActive(null)
    setBulkMsg(null)
    if (influencer) { setAudience('picked'); setPicked([influencer.id]) }
    setComposing(true)
  }

  const activeCount = recipients.filter(r => r.active !== false).length
  const targetCount = audience === 'picked' ? picked.length
    : audience === 'active' ? activeCount
    : recipients.length

  const sendBulk = async () => {
    const body = bulkText.trim()
    if (!body || bulkSending || targetCount === 0) return
    const who = audience === 'picked'
      ? `${picked.length} избрани инфлуенсъри`
      : audience === 'active' ? `ВСИЧКИ ${activeCount} активни инфлуенсъри`
      : `ВСИЧКИ ${recipients.length} инфлуенсъри (вкл. неактивните)`
    if (!confirm(`Да изпратя ли съобщението до ${who}?\n\nВсеки получава съобщението в чата си и имейл.`)) return

    setBulkSending(true); setBulkMsg(null)
    const payload = audience === 'picked'
      ? { influencerIds: picked, body }
      : { audience, body }
    try {
      const res = await fetch('/api/admin/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setBulkMsg({ ok: 1, t: `Изпратено до ${d.sent} · имейл до ${d.emailed}${d.withoutEmail ? ` · ${d.withoutEmail} без имейл/известия` : ''}` })
        setBulkText('')
        loadList()
      } else {
        setBulkMsg({ ok: 0, t: d.error || `Грешка ${res.status}` })
      }
    } catch (e) {
      setBulkMsg({ ok: 0, t: e.message })
    }
    setBulkSending(false)
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
        <div style={{ marginBottom: 16, paddingTop: 8, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>💬 Съобщения</h1>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Чат с инфлуенсърите</div>
          </div>
          <button className="btn btn-primary" onClick={() => openCompose()} style={{ whiteSpace: 'nowrap' }}>
            ✉️ Ново съобщение
          </button>
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
            {composing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
                <div style={{ fontWeight: 700, fontSize: 15, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  Ново съобщение
                  <button className="btn btn-sm" style={{ marginLeft: 8, background: 'transparent' }}
                    onClick={() => setComposing(false)}>отказ</button>
                </div>

                {/* Аудитория */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { k: 'active', label: `Всички активни (${activeCount})` },
                    { k: 'all',    label: `Всички (${recipients.length})` },
                    { k: 'picked', label: 'Избрани' },
                  ].map(o => (
                    <button
                      key={o.k}
                      onClick={() => setAudience(o.k)}
                      className={`chip ${audience === o.k ? 'active' : ''}`}
                      style={{ cursor: 'pointer' }}
                    >{o.label}</button>
                  ))}
                </div>

                {/* Избор на конкретни инфлуенсъри */}
                {audience === 'picked' && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={pickQuery}
                        onChange={e => setPickQuery(e.target.value)}
                        placeholder="Търси инфлуенсър…"
                        style={{ flex: 1, fontSize: 13 }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{picked.length} избрани</span>
                      {picked.length > 0 && (
                        <button className="btn btn-sm" style={{ background: 'transparent' }} onClick={() => setPicked([])}>изчисти</button>
                      )}
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {recipients
                        .filter(r => {
                          const q = pickQuery.trim().toLowerCase()
                          if (!q) return true
                          return [r.name, r.username, r.promo_code].filter(Boolean).some(v => v.toLowerCase().includes(q))
                        })
                        .map(r => {
                          const on = picked.includes(r.id)
                          return (
                            <label key={r.id} style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                              borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
                              background: on ? 'var(--accent-lt)' : 'transparent',
                            }}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setPicked(p => on ? p.filter(x => x !== r.id) : [...p, r.id])}
                                style={{ width: 15, height: 15, cursor: 'pointer' }}
                              />
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.name}
                                {r.promo_code && <span style={{ color: 'var(--muted)' }}> · {r.promo_code}</span>}
                              </span>
                              {r.active === false && <span className="badge badge-gray" style={{ fontSize: 9 }}>неактивен</span>}
                              {(!r.email || r.email_notifications === false) && (
                                <span title="Няма имейл или известията са изключени — ще получи само съобщение в чата"
                                  style={{ fontSize: 11, color: 'var(--muted)' }}>без имейл</span>
                              )}
                            </label>
                          )
                        })}
                    </div>
                  </div>
                )}

                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder="Съобщение до инфлуенсърите…"
                  rows={6}
                  style={{ fontSize: 14, resize: 'vertical' }}
                />

                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Всеки получател вижда съобщението в чата си и получава имейл (ако има имейл и включени известия).
                </div>

                {bulkMsg && (
                  <div className={`alert alert-${bulkMsg.ok ? 'success' : 'error'}`} style={{ marginBottom: 0 }}>{bulkMsg.t}</div>
                )}

                <div>
                  <button
                    className="btn btn-primary"
                    onClick={sendBulk}
                    disabled={bulkSending || !bulkText.trim() || targetCount === 0}
                  >
                    {bulkSending ? 'Изпращане…' : `Изпрати до ${targetCount}`}
                  </button>
                </div>
              </div>
            ) : !active ? (
              <div style={{ margin: 'auto', color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
                Избери разговор отляво или{' '}
                <button className="btn btn-sm" style={{ marginLeft: 4 }} onClick={() => openCompose()}>напиши ново</button>
              </div>
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
