import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/payouts — всички заявки + влъжен influencer
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('payout_requests')
    .select('id, amount, status, requested_at, processed_at, notes, admin_notes, influencer_id')
    .order('requested_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)

  const { data: payouts, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Влъжваме инфо за инфлуенсърите (отделна заявка — избягваме join quirk)
  const ids = [...new Set((payouts || []).map(p => p.influencer_id).filter(Boolean))]
  let infMap = {}
  if (ids.length > 0) {
    const { data: infs } = await supabaseAdmin
      .from('influencers')
      .select('id, name, username, promo_code, avatar_url, email')
      .in('id', ids)
    infMap = Object.fromEntries((infs || []).map(i => [i.id, i]))
  }

  return NextResponse.json({
    payouts: (payouts || []).map(p => ({ ...p, influencer: infMap[p.influencer_id] || null })),
  })
}

// PATCH /api/admin/payouts { id, status, admin_notes? }
export async function PATCH(request) {
  const { id, status, admin_notes } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })
  if (!['pending', 'approved', 'paid', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Невалиден статус' }, { status: 400 })
  }

  const updates = {
    status,
    processed_at: status === 'pending' ? null : new Date().toISOString(),
  }
  if (admin_notes !== undefined) updates.admin_notes = admin_notes

  const { data, error } = await supabaseAdmin
    .from('payout_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
