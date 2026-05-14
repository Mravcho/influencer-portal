import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/applications                  → всички заявки
// GET /api/admin/applications?count=pending    → брой pending
// GET /api/admin/applications?status=pending   → филтрирани
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const status    = searchParams.get('status')
  const countOnly = searchParams.get('count')

  if (countOnly) {
    const { count } = await supabaseAdmin
      .from('influencer_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', countOnly)
    return NextResponse.json({ count: count || 0 })
  }

  let query = supabaseAdmin
    .from('influencer_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ applications: data || [] })
}

// PATCH /api/admin/applications { id, status, reviewer_notes? }
export async function PATCH(request) {
  const { id, status, reviewer_notes } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Невалиден статус' }, { status: 400 })
  }

  const updates = {
    status,
    reviewed_at:    status === 'pending' ? null : new Date().toISOString(),
    reviewer_notes: reviewer_notes ?? null,
  }

  const { data, error } = await supabaseAdmin
    .from('influencer_applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
