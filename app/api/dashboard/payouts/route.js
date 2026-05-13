import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MIN_PAYOUT = 100 // евро
const VOIDED = new Set(['voided', 'refunded'])

function commissionableOf(o) {
  const stored = parseFloat(o.commissionable_revenue)
  if (stored > 0) return stored
  return (o.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
}

async function calcAvailable(influencerId) {
  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('commission')
    .eq('id', influencerId)
    .single()

  const rate = parseFloat(inf?.commission || 0)

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('commissionable_revenue, line_items, financial_status')
    .eq('influencer_id', influencerId)

  const totalEarned = (orders || []).reduce((s, o) => {
    if (VOIDED.has(o.financial_status)) return s
    return s + commissionableOf(o) * rate / 100
  }, 0)

  const { data: payouts } = await supabaseAdmin
    .from('payout_requests')
    .select('amount, status')
    .eq('influencer_id', influencerId)

  // Pending / approved / paid — всичко занижава наличното
  const reserved = (payouts || []).reduce((s, p) => {
    if (p.status === 'rejected') return s
    return s + parseFloat(p.amount || 0)
  }, 0)

  return {
    totalEarned: Math.round(totalEarned * 100) / 100,
    reserved:    Math.round(reserved    * 100) / 100,
    available:   Math.round((totalEarned - reserved) * 100) / 100,
    minPayout:   MIN_PAYOUT,
  }
}

// GET /api/dashboard/payouts — моите заявки + наличен баланс
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const viewId = searchParams.get('viewId')

  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId

  const balance = await calcAvailable(influencerId)

  const { data: payouts } = await supabaseAdmin
    .from('payout_requests')
    .select('id, amount, status, requested_at, processed_at, notes, admin_notes')
    .eq('influencer_id', influencerId)
    .order('requested_at', { ascending: false })

  return NextResponse.json({ balance, payouts: payouts || [] })
}

// POST /api/dashboard/payouts { amount, notes? } — нова заявка
export async function POST(request) {
  const userRole = request.headers.get('x-user-role')
  if (userRole === 'admin') {
    return NextResponse.json({ error: 'Admin не може да създава заявки' }, { status: 403 })
  }

  const influencerId = request.headers.get('x-user-id')
  const { amount, notes } = await request.json()
  const amt = parseFloat(amount)

  if (!amt || amt <= 0) return NextResponse.json({ error: 'Невалидна сума' }, { status: 400 })
  if (amt < MIN_PAYOUT)  return NextResponse.json({ error: `Минимална сума за заявка: ${MIN_PAYOUT} €` }, { status: 400 })

  const balance = await calcAvailable(influencerId)
  if (amt > balance.available) {
    return NextResponse.json({
      error: `Заявената сума надвишава наличния баланс (${balance.available} €)`,
    }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('payout_requests')
    .insert({ influencer_id: influencerId, amount: amt, notes: notes || null, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
