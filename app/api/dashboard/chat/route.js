import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewChatMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = (process.env.ADMIN_NOTIFY_EMAILS || 'pavel@realfood.bg,order@realfood.bg')
  .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// GET → съобщенията на логнатия инфлуенсър (маркира админските като прочетени)
export async function GET(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const { data: messages, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, sender, body, created_at')
    .eq('influencer_id', influencerId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Маркираме админските съобщения като прочетени от инфлуенсъра
  await supabaseAdmin
    .from('chat_messages')
    .update({ read_by_influencer: true })
    .eq('influencer_id', influencerId).eq('sender', 'admin').eq('read_by_influencer', false)

  return NextResponse.json({ messages: messages || [] },
    { headers: { 'Cache-Control': 'no-store' } })
}

// POST { body } → инфлуенсърът пише въпрос; уведомяваме админа по имейл
export async function POST(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const { body } = await request.json()
  const text = String(body || '').trim()
  if (!text) return NextResponse.json({ error: 'Празно съобщение' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({ influencer_id: influencerId, sender: 'influencer', body: text, read_by_influencer: true })
    .select('id, sender, body, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Имейл до админа (fire-and-forget)
  supabaseAdmin.from('influencers').select('name').eq('id', influencerId).single()
    .then(({ data: inf }) => sendNewChatMessage({
      to: ADMIN_EMAILS,
      influencerName: inf?.name || 'Инфлуенсър',
      senderRole: 'influencer',
      messagePreview: text,
      link: `${PORTAL_URL}/admin/messages`,
    }))
    .catch(err => console.error('Chat admin email failed:', err.message))

  return NextResponse.json(data, { status: 201 })
}
