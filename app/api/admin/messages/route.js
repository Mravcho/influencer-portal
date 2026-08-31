import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewChatMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'
// Масовото изпращане прави по един имейл на инфлуенсър.
export const maxDuration = 300

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// GET /api/admin/messages                     → списък разговори (последно съобщение + непрочетени)
// GET /api/admin/messages?count=unread        → общ брой непрочетени (за badge)
// GET /api/admin/messages?influencerId=<id>   → нишката + маркира като прочетени
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const count = searchParams.get('count')
  const influencerId = searchParams.get('influencerId')
  const list = searchParams.get('list')

  // Лек списък с получатели за композитора на ново съобщение.
  // (/api/admin/influencers смята и статистики — тук не ни трябват.)
  if (list === 'recipients') {
    const { data } = await supabaseAdmin
      .from('influencers')
      .select('id, name, username, promo_code, avatar_url, email, email_notifications, active, category')
      .order('name')
    return NextResponse.json({ influencers: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (count === 'unread') {
    const { count: c } = await supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender', 'influencer').eq('read_by_admin', false)
    return NextResponse.json({ count: c || 0 }, { headers: { 'Cache-Control': 'no-store' } })
  }

  if (influencerId) {
    const { data: messages } = await supabaseAdmin
      .from('chat_messages')
      .select('id, sender, body, created_at')
      .eq('influencer_id', influencerId)
      .order('created_at', { ascending: true })
    // Маркираме въпросите на инфлуенсъра като прочетени от админа
    await supabaseAdmin
      .from('chat_messages')
      .update({ read_by_admin: true })
      .eq('influencer_id', influencerId).eq('sender', 'influencer').eq('read_by_admin', false)
    return NextResponse.json({ messages: messages || [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Списък разговори — групираме съобщенията по инфлуенсър
  const { data: all } = await supabaseAdmin
    .from('chat_messages')
    .select('influencer_id, sender, body, created_at, read_by_admin')
    .order('created_at', { ascending: false })
    .limit(3000)

  const byInf = {}
  for (const m of all || []) {
    const e = byInf[m.influencer_id] || (byInf[m.influencer_id] = { influencer_id: m.influencer_id, last: null, unread: 0 })
    if (!e.last) e.last = { sender: m.sender, body: m.body, created_at: m.created_at }
    if (m.sender === 'influencer' && !m.read_by_admin) e.unread += 1
  }

  const ids = Object.keys(byInf)
  let infMap = {}
  if (ids.length) {
    const { data: infs } = await supabaseAdmin
      .from('influencers').select('id, name, username, avatar_url, promo_code').in('id', ids)
    infMap = Object.fromEntries((infs || []).map(i => [i.id, i]))
  }

  const conversations = Object.values(byInf)
    .map(e => ({ ...e, influencer: infMap[e.influencer_id] || null }))
    .sort((a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0))

  return NextResponse.json({ conversations }, { headers: { 'Cache-Control': 'no-store' } })
}

// Изпраща имейлите с ограничена едновременност — Graph API не обича залпове,
// а и функцията има лимит за време.
async function notifyByEmail(recipients, text) {
  const link = `${PORTAL_URL}/dashboard#chat`
  const targets = recipients.filter(r => r.email && r.email_notifications !== false)
  let emailed = 0
  const CONCURRENCY = 4
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const chunk = targets.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(chunk.map(r => sendNewChatMessage({
      to: r.email,
      influencerName: r.name,
      senderRole: 'admin',
      messagePreview: text,
      link,
    })))
    for (const res of results) {
      if (res.status === 'fulfilled') emailed++
      else console.error('Chat influencer email failed:', res.reason?.message || res.reason)
    }
  }
  return emailed
}

// POST /api/admin/messages
//   { influencerId, body }            → едно съобщение (отговор в нишка)
//   { influencerIds: [...], body }    → до избрани инфлуенсъри
//   { audience: 'all' | 'active', body } → до всички / всички активни
// Във всички случаи съобщението влиза в чата на инфлуенсъра и му се праща имейл.
export async function POST(request) {
  const payload = await request.json()
  const text = String(payload.body || '').trim()
  if (!text) return NextResponse.json({ error: 'Празно съобщение' }, { status: 400 })

  const { influencerId, influencerIds, audience } = payload
  const isBulk = Array.isArray(influencerIds) || !!audience

  // ---------- едно съобщение (както досега — отговор в отворена нишка) ----------
  if (!isBulk) {
    if (!influencerId) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({ influencer_id: influencerId, sender: 'admin', body: text, read_by_admin: true })
      .select('id, sender, body, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: inf } = await supabaseAdmin
      .from('influencers').select('name, email, email_notifications').eq('id', influencerId).single()
    if (inf) await notifyByEmail([inf], text)

    return NextResponse.json(data, { status: 201 })
  }

  // ---------- масово ----------
  let query = supabaseAdmin
    .from('influencers')
    .select('id, name, email, email_notifications, active')

  if (Array.isArray(influencerIds)) {
    if (influencerIds.length === 0) {
      return NextResponse.json({ error: 'Не са избрани получатели' }, { status: 400 })
    }
    query = query.in('id', influencerIds)
  } else if (audience === 'active') {
    query = query.eq('active', true)
  } else if (audience !== 'all') {
    return NextResponse.json({ error: 'Невалидна аудитория' }, { status: 400 })
  }

  const { data: recipients, error: recErr } = await query
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
  if (!recipients?.length) return NextResponse.json({ error: 'Няма получатели' }, { status: 400 })

  const { error: insErr } = await supabaseAdmin
    .from('chat_messages')
    .insert(recipients.map(r => ({
      influencer_id: r.id, sender: 'admin', body: text, read_by_admin: true,
    })))
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const emailed = await notifyByEmail(recipients, text)

  return NextResponse.json({
    ok: true,
    sent: recipients.length,
    emailed,
    withoutEmail: recipients.filter(r => !r.email || r.email_notifications === false).length,
  }, { status: 201 })
}
