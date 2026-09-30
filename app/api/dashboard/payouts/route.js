import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPayoutRequestEmail } from '@/lib/email'
import { calcAvailable, MIN_PAYOUT } from '@/lib/payout-balance'
import { commissionProductPayments } from '@/lib/product-payment'
import { getAdminNotifyEmails } from '@/lib/notify-emails'

export const dynamic = 'force-dynamic'

const PORTAL_URL  = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

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

  // Продукти, платени с комисионната — показват се в историята като удръжки
  let productPayments = []
  try { productPayments = await commissionProductPayments(influencerId) }
  catch (err) { console.error(err.message) }

  return NextResponse.json({ balance, payouts: payouts || [], productPayments })
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
        to:             await getAdminNotifyEmails(),
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
