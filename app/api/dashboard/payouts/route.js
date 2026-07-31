import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPayoutRequestEmail } from '@/lib/email'
import { orderCommission } from '@/lib/commission'

export const dynamic = 'force-dynamic'

const MIN_PAYOUT  = 100 // евро
const VOIDED      = new Set(['voided', 'refunded'])
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'pavel@realfood.bg'
const PORTAL_URL  = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

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
    .select('commissionable_revenue, line_items, financial_status, commission_pct, created_at_shopify')
    .eq('influencer_id', influencerId)

  const monthStart = new Date()
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const totalEarned = (orders || []).reduce((s, o) => {
    if (VOIDED.has(o.financial_status)) return s
    return s + orderCommission(o, commissionableOf(o), rate)
  }, 0)
  const earnedThisMonth = (orders || []).reduce((s, o) => {
    if (VOIDED.has(o.financial_status)) return s
    if (new Date(o.created_at_shopify) < monthStart) return s
    return s + orderCommission(o, commissionableOf(o), rate)
  }, 0)

  const { data: payouts } = await supabaseAdmin
    .from('payout_requests')
    .select('amount, status, requested_at, processed_at')
    .eq('influencer_id', influencerId)

  // Изтеглено този месец (по дата на плащане, иначе на заявка), без отказаните
  const paidThisMonth = (payouts || []).reduce((s, p) => {
    if (p.status === 'rejected') return s
    const d = new Date(p.processed_at || p.requested_at)
    return d >= monthStart ? s + parseFloat(p.amount || 0) : s
  }, 0)

  // Разбивка на заявките: вече изплатено vs в процес (чака/одобрено)
  const paid = (payouts || []).reduce(
    (s, p) => s + (p.status === 'paid' ? parseFloat(p.amount || 0) : 0), 0
  )
  const pending = (payouts || []).reduce(
    (s, p) => s + (p.status === 'pending' || p.status === 'approved' ? parseFloat(p.amount || 0) : 0), 0
  )
  // Всичко нерефузирано занижава наличното
  const reserved = paid + pending

  return {
    totalEarned:     Math.round(totalEarned * 100) / 100,
    earnedThisMonth: Math.round(earnedThisMonth * 100) / 100,
    paidThisMonth:   Math.round(paidThisMonth * 100) / 100,
    paid:            Math.round(paid        * 100) / 100,
    pending:         Math.round(pending     * 100) / 100,
    reserved:        Math.round(reserved    * 100) / 100,
    available:       Math.round((totalEarned - reserved) * 100) / 100,
    minPayout:       MIN_PAYOUT,
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
    .select('id, amount, status, requested_at, processed_at, notes, admin_notes, invoice_url, invoice_filename')
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
  const { amount, notes, invoice_url, invoice_filename } = await request.json()
  const amt = parseFloat(amount)

  if (!amt || amt <= 0) return NextResponse.json({ error: 'Невалидна сума' }, { status: 400 })
  if (amt < MIN_PAYOUT)  return NextResponse.json({ error: `Минимална сума за заявка: ${MIN_PAYOUT} €` }, { status: 400 })
  if (!invoice_url) {
    return NextResponse.json({
      error: 'Прикачи фактура — без финансов документ не се правят изплащания.',
    }, { status: 400 })
  }

  const balance = await calcAvailable(influencerId)
  if (amt > balance.available) {
    return NextResponse.json({
      error: `Заявената сума надвишава наличния баланс (${balance.available} €)`,
    }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('payout_requests')
    .insert({
      influencer_id:        influencerId,
      amount:               amt,
      notes:                notes || null,
      status:               'pending',
      invoice_url,
      invoice_filename:     invoice_filename || null,
      invoice_uploaded_at:  new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Уведомяваме admin за нова заявка
  try {
    const { data: inf } = await supabaseAdmin
      .from('influencers')
      .select('name, promo_code')
      .eq('id', influencerId)
      .single()
    if (inf) {
      await sendPayoutRequestEmail({
        to:             ADMIN_EMAIL,
        adminPortalUrl: PORTAL_URL,
        influencerName: inf.name,
        promoCode:      inf.promo_code,
        amount:         amt,
        notes:          notes,
      })
    }
  } catch (emailErr) {
    console.error('Admin payout email failed:', emailErr.message)
  }

  return NextResponse.json(data, { status: 201 })
}
