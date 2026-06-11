import { NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({}, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({}, { status: 401 })

  // Heartbeat — обновяваме last_seen_at + duration за активна сесия
  if (payload.sessionId) {
    const now = new Date()
    const { data: sess } = await supabaseAdmin
      .from('login_sessions')
      .select('login_at')
      .eq('id', payload.sessionId)
      .single()
    if (sess) {
      const duration = Math.round((now - new Date(sess.login_at)) / 1000)
      await supabaseAdmin
        .from('login_sessions')
        .update({ last_seen_at: now.toISOString(), duration_seconds: duration })
        .eq('id', payload.sessionId)
    }
  }

  // За инфлуенсъри връщаме fresh active + commission от базата
  // (за да виждаме незабавно ако admin е реактивирал/деактивирал акаунта
  //  или е променил commission-а, без да изисква re-login).
  let active = true
  let commission = parseFloat(payload.commission || 0)
  if (payload.role === 'influencer' && payload.id) {
    const { data: inf } = await supabaseAdmin
      .from('influencers')
      .select('active, commission')
      .eq('id', payload.id)
      .maybeSingle()
    if (inf) {
      active     = inf.active !== false
      commission = parseFloat(inf.commission || 0)
    }
  }

  return NextResponse.json({
    name:       payload.name || '',
    username:   payload.username || '',
    promoCode:  payload.promoCode || '',
    commission,
    role:       payload.role,
    active,
  })
}
