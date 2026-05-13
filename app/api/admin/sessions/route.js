import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/sessions?influencer_id=uuid → последните 100 сесии за инфлуенсър
// GET /api/admin/sessions                    → последните 100 сесии общо
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get('influencer_id')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

  // Стъпка 1: вземаме сесиите (без join — избягваме quirk с !inner + order + limit)
  let query = supabaseAdmin
    .from('login_sessions')
    .select('id, login_at, last_seen_at, logout_at, duration_seconds, ip_address, user_agent, country, city, influencer_id')
    .order('login_at', { ascending: false })
    .limit(limit)

  if (influencerId) query = query.eq('influencer_id', influencerId)

  const { data: rawSessions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessionsList = rawSessions || []

  // Стъпка 2: вземаме инфлуенсърите за тези сесии (един път)
  const ids = [...new Set(sessionsList.map(s => s.influencer_id).filter(Boolean))]
  let infMap = {}
  if (ids.length > 0) {
    const { data: infs } = await supabaseAdmin
      .from('influencers')
      .select('id, name, username, promo_code, avatar_url')
      .in('id', ids)
    infMap = Object.fromEntries((infs || []).map(i => [i.id, i]))
  }

  const now = new Date()
  const sessions = sessionsList.map(s => {
    const liveDuration = s.logout_at
      ? s.duration_seconds
      : Math.max(s.duration_seconds || 0, Math.round((now - new Date(s.login_at)) / 1000))

    return {
      ...s,
      duration_seconds: liveDuration,
      is_active:        !s.logout_at && isActiveNow(s.last_seen_at, now),
      influencers:      infMap[s.influencer_id] || null,
    }
  })

  return NextResponse.json({ sessions })
}

function isActiveNow(lastSeenAt, now) {
  if (!lastSeenAt) return false
  return (now - new Date(lastSeenAt)) < 2 * 60 * 1000
}
