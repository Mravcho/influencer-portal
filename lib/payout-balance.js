import { supabaseAdmin } from './supabase'
import { orderCommission } from './commission'

// Наличен баланс за изплащане на инфлуенсър — споделено между
// /api/dashboard/payouts (инфлуенсърът заявява сам) и
// /api/admin/payouts (админът въвежда заявка по получена извън портала фактура).
const MIN_PAYOUT  = 100 // евро
const VOIDED      = new Set(['voided', 'refunded'])

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

export { calcAvailable, MIN_PAYOUT }
