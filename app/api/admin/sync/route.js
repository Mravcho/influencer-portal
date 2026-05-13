import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncInfluencer } from '@/lib/sync'

// POST /api/admin/sync          → sync всички инфлуенсъри
// POST /api/admin/sync?id=uuid  → sync само един
// POST /api/admin/sync?full=true → пълен ре-синк (изтрива и презарежда)
export async function POST(request) {
  const authHeader = request.headers.get('authorization')
  const userRole   = request.headers.get('x-user-role')
  const isCron     = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdmin    = userRole === 'admin'
  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const singleId   = searchParams.get('id')
  const fullResync = searchParams.get('full') === 'true'

  let query = supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, commission, email, email_notifications')
    .eq('active', true)
  if (singleId) query = query.eq('id', singleId)

  const { data: influencers, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const influencer of influencers) {
    const result = await syncInfluencer(influencer, { fullResync })
    results.push(result)
  }

  return NextResponse.json({ ok: true, results, syncedAt: new Date().toISOString() })
}
