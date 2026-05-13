import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /api/admin/sessions?influencer_id=uuid → последните 100 сесии за инфлуенсър
// GET /api/admin/sessions                    → последните 100 сесии общо
// DELETE /api/admin/sessions?cleanup=orphans → чисти сесии със изтрит инфлуенсър
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get('influencer_id')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

  // Стъпка 1: вземаме сесиите (без join — избягваме quirk с !inner + order + limit)
  let query = supabaseAdmin
    .from('login_sessions')
    .select('id, login_at, last_seen_at, logout_at, duration_seconds, ip_address, user_agent, country, city, influencer_id, success, failure_reason, attempted_username')
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

// DELETE /api/admin/sessions?cleanup=orphans → изтрива сесии чийто influencer_id
// вече не съществува в influencers таблицата
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('cleanup') !== 'orphans') {
    return NextResponse.json({ error: 'Невалиден параметър' }, { status: 400 })
  }

  // Намираме всички уникални influencer_id от сесиите
  const { data: sessions } = await supabaseAdmin
    .from('login_sessions')
    .select('influencer_id')
    .not('influencer_id', 'is', null)

  const sessionIds = [...new Set((sessions || []).map(s => s.influencer_id))]
  if (sessionIds.length === 0) return NextResponse.json({ deleted: 0 })

  // Кои от тях наистина съществуват в influencers
  const { data: existing } = await supabaseAdmin
    .from('influencers')
    .select('id')
    .in('id', sessionIds)

  const existingSet = new Set((existing || []).map(i => i.id))
  const orphanIds = sessionIds.filter(id => !existingSet.has(id))

  if (orphanIds.length === 0) return NextResponse.json({ deleted: 0, orphans: [] })

  const { error, count } = await supabaseAdmin
    .from('login_sessions')
    .delete({ count: 'exact' })
    .in('influencer_id', orphanIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: count || 0, orphans: orphanIds })
}
