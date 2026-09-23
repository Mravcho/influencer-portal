import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createExpenseFromInvoiceUrl } from '@/lib/erp'
import { calcAvailable } from '@/lib/payout-balance'

export const dynamic = 'force-dynamic'

// GET /api/admin/payouts                  → всички заявки + влъжен influencer
// GET /api/admin/payouts?count=pending    → само брой pending (за badge)
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const countOnly = searchParams.get('count')

  if (countOnly) {
    const { count, error } = await supabaseAdmin
      .from('payout_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', countOnly)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ count: count || 0 })
  }

  let query = supabaseAdmin
    .from('payout_requests')
    .select('*')
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

  return NextResponse.json(await syncErp(data))
}

// При одобрение/плащане → автоматично качваме фактурата като разход в ERP.
// Прави се веднъж (ако erp_expense_id още липсва) и НЕ блокира одобрението при грешка.
async function syncErp(data) {
  if (!['approved', 'paid'].includes(data.status) || !data.invoice_url || data.erp_expense_id) return data
  // Налагаме категория „Инфлуенсъри" (иначе AI слага своя, напр. „Реклама")
  const erp = await createExpenseFromInvoiceUrl(data.invoice_url, {
    category: process.env.EXPENSE_ERP_CATEGORY || 'Инфлуенсъри',
  })
  const erpUpdates = {
    erp_synced_at: new Date().toISOString(),
    erp_warning:   erp.ok ? (erp.warning || null) : erp.error,
  }
  if (erp.ok && erp.id) erpUpdates.erp_expense_id = erp.id
  const { data: data2 } = await supabaseAdmin
    .from('payout_requests').update(erpUpdates).eq('id', data.id).select().single()
  return { ...(data2 || data), erp }
}

// POST /api/admin/payouts { influencer_id, amount, invoice_url, invoice_filename?, notes?, admin_notes?, mark_paid? }
// Админът въвежда заявка от името на инфлуенсър — за фактури, изпратени извън
// портала. Сумата се резервира от баланса му както при собствена заявка, така че
// „налично за теглене" остава вярно и плащането е проследимо.
export async function POST(request) {
  const body = await request.json()
  const { influencer_id, amount, invoice_url, invoice_filename, notes, admin_notes, mark_paid } = body
  const amt = parseFloat(amount)

  if (!influencer_id) return NextResponse.json({ error: 'Липсва инфлуенсър' }, { status: 400 })
  if (!amt || amt <= 0) return NextResponse.json({ error: 'Невалидна сума' }, { status: 400 })
  if (!invoice_url) {
    return NextResponse.json({ error: 'Прикачи фактурата — без финансов документ не се записва изплащане.' }, { status: 400 })
  }

  const { data: inf } = await supabaseAdmin
    .from('influencers').select('id, name').eq('id', influencer_id).maybeSingle()
  if (!inf) return NextResponse.json({ error: 'Инфлуенсърът не съществува' }, { status: 404 })

  const balance = await calcAvailable(influencer_id)
  if (amt > balance.available + 0.005) {
    return NextResponse.json({
      error: `Сумата надвишава наличния баланс на ${inf.name} (${balance.available.toFixed(2)} €)`,
    }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('payout_requests')
    .insert({
      influencer_id,
      amount:              amt,
      status:              mark_paid ? 'paid' : 'pending',
      requested_at:        now,
      processed_at:        mark_paid ? now : null,
      notes:               notes || null,
      admin_notes:         admin_notes || 'Въведена от екипа по фактура, изпратена извън портала.',
      invoice_url,
      invoice_filename:    invoice_filename || null,
      invoice_uploaded_at: now,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(await syncErp(data), { status: 201 })
}
