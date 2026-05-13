import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/sessions?influencer_id=uuid → последните 100 сесии
// GET /api/admin/sessions                    → последните 100 сесии общо
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get('influencer_id')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)

  let query = supabaseAdmin
    .from('login_sessions')
    .select(`
      id, login_at, last_seen_at, logout_at, duration_seconds,
      ip_address, user_agent, country, city, influencer_id,
      influencers!inner(id, name, username, promo_code, avatar_url)
    `)
    .order('login_at', { ascending: false })
    .limit(limit)

  if (influencerId) query = query.eq('influencer_id', influencerId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Изчисляваме live duration за активни сесии (без logout)
  const now = new Date()
  const sessions = (data || []).map(s => {
    if (!s.logout_at) {
      const live = Math.round((now - new Date(s.login_at)) / 1000)
      const stored = s.duration_seconds || 0
      return { ...s, duration_seconds: Math.max(live, stored), is_active: isActiveNow(s.last_seen_at, now) }
    }
    return { ...s, is_active: false }
  })

  return NextResponse.json({ sessions })
}

function isActiveNow(lastSeenAt, now) {
  if (!lastSeenAt) return false
  // Считаме сесията за активна ако last_seen е през последните 2 минути
  return (now - new Date(lastSeenAt)) < 2 * 60 * 1000
}
