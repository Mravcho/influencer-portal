import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewChatMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// GET /api/admin/messages                     → списък разговори (последно съобщение + непрочетени)
// GET /api/admin/messages?count=unread        → общ брой непрочетени (за badge)
// GET /api/admin/messages?influencerId=<id>   → нишката + маркира като прочетени
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const count = searchParams.get('count')
  const influencerId = searchParams.get('influencerId')

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

// POST /api/admin/messages { influencerId, body } → отговор от админа + имейл до инфлуенсъра
export async function POST(request) {
  const { influencerId, body } = await request.json()
  const text = String(body || '').trim()
  if (!influencerId || !text) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({ influencer_id: influencerId, sender: 'admin', body: text, read_by_admin: true })
    .select('id, sender, body, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Имейл до инфлуенсъра (ако има мейл и известията са включени)
  supabaseAdmin.from('influencers').select('name, email, email_notifications').eq('id', influencerId).single()
    .then(({ data: inf }) => {
      if (inf?.email && inf.email_notifications !== false) {
        return sendNewChatMessage({
          to: inf.email,
          influencerName: inf.name,
          senderRole: 'admin',
          messagePreview: text,
          link: `${PORTAL_URL}/dashboard#chat`,
        })
      }
    })
    .catch(err => console.error('Chat influencer email failed:', err.message))

  return NextResponse.json(data, { status: 201 })
}
