import { NextResponse } from 'next/server'
import { COOKIE_NAME, verifyToken } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request) {
  // Затваряме session-а ако има такъв
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (token) {
    const payload = await verifyToken(token)
    if (payload?.sessionId) {
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
          .update({
            logout_at:        now.toISOString(),
            last_seen_at:     now.toISOString(),
            duration_seconds: duration,
          })
          .eq('id', payload.sessionId)
      }
    }
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.delete(COOKIE_NAME)
  return response
}
