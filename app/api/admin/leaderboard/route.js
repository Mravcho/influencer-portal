import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const VOIDED_STATUSES = new Set(['voided', 'refunded'])

function commissionableOf(o) {
  const stored = parseFloat(o.commissionable_revenue)
  if (stored > 0) return stored
  return (o.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
}

// GET /api/admin/leaderboard?month=YYYY-MM
// Връща класацията на инфлуенсърите за конкретен месец
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month') // 'YYYY-MM'

  // По default — текущ месец
  const now = new Date()
  let year, month
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    [year, month] = monthParam.split('-').map(Number)
  } else {
    year  = now.getFullYear()
    month = now.getMonth() + 1
  }

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth   = new Date(year, month, 1) // exclusive

  // Инфлуенсъри (за commission rate, име, avatar)
  const { data: influencers, error: infErr } = await supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, commission, avatar_url, platform')
  if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 })

  const infMap = Object.fromEntries(influencers.map(i => [i.id, i]))

  // Поръчки за избрания месец
  const { data: orders, error: ordErr } = await supabaseAdmin
    .from('orders')
    .select('influencer_id, commissionable_revenue, line_items, financial_status, total_price')
    .gte('created_at_shopify', startOfMonth.toISOString())
    .lt('created_at_shopify', endOfMonth.toISOString())
  if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 })

  const byInf = {}
  ;(orders || []).forEach(o => {
    if (VOIDED_STATUSES.has(o.financial_status)) return
    const inf = infMap[o.influencer_id]
    if (!inf) return
    if (!byInf[o.influencer_id]) {
      byInf[o.influencer_id] = {
        id:         inf.id,
        name:       inf.name,
        promo_code: inf.promo_code,
        avatar_url: inf.avatar_url,
        platform:   inf.platform,
        orders:     0,
        revenue:    0,
        commission: 0,
      }
    }
    const e = byInf[o.influencer_id]
    e.orders += 1
    e.revenue += parseFloat(o.total_price || 0)
    e.commission += commissionableOf(o) * (parseFloat(inf.commission || 0) / 100)
  })

  // Включваме ВСИЧКИ инфлуенсъри в класирането, дори с 0 поръчки.
  // Така user-ът вижда всички 8 (например), не само тези с поръчки.
  influencers.forEach(inf => {
    if (!byInf[inf.id]) {
      byInf[inf.id] = {
        id:         inf.id,
        name:       inf.name,
        promo_code: inf.promo_code,
        avatar_url: inf.avatar_url,
        platform:   inf.platform,
        orders:     0,
        revenue:    0,
        commission: 0,
      }
    }
  })

  const ranked = Object.values(byInf)
    .map(e => ({
      ...e,
      revenue:    Math.round(e.revenue    * 100) / 100,
      commission: Math.round(e.commission * 100) / 100,
    }))
    .sort((a, b) => b.commission - a.commission || b.orders - a.orders)
    .map((e, idx) => ({ ...e, rank: idx + 1 }))

  const withOrders = ranked.filter(r => r.orders > 0)

  return NextResponse.json({
    month: `${year}-${String(month).padStart(2, '0')}`,
    ranking: ranked,
    totals: {
      influencers:      ranked.length,
      withOrders:       withOrders.length,
      orders:           ranked.reduce((s, e) => s + e.orders, 0),
      revenue:          Math.round(ranked.reduce((s, e) => s + e.revenue, 0) * 100) / 100,
      commission:       Math.round(ranked.reduce((s, e) => s + e.commission, 0) * 100) / 100,
    },
  })
}
