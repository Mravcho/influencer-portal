import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { orderCommission } from '@/lib/commission'

const VOIDED_STATUSES = new Set(['voided', 'refunded'])

function commissionableOf(o) {
  const stored = parseFloat(o.commissionable_revenue)
  if (stored > 0) return stored
  return (o.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')

  // Тегли всички инфлуенсъри + комисионната им
  const { data: influencers, error: infErr } = await supabaseAdmin
    .from('influencers')
    .select('id, name, commission')
  if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 })

  const commissionByInf = Object.fromEntries(
    influencers.map(i => [i.id, parseFloat(i.commission || 0)])
  )
  const nameByInf = Object.fromEntries(influencers.map(i => [i.id, i.name]))

  // Активни поръчки за последните N дни (за дневна графика)
  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)

  const { data: recentOrders, error: ordErr } = await supabaseAdmin
    .from('orders')
    .select('influencer_id, commissionable_revenue, line_items, financial_status, created_at_shopify, commission_pct')
    .gte('created_at_shopify', since.toISOString())
  if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 })

  // Дневна разбивка
  const dailyMap = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { date: key, orders: 0, commission: 0 }
  }

  recentOrders.forEach(o => {
    if (VOIDED_STATUSES.has(o.financial_status)) return
    const key = o.created_at_shopify.slice(0, 10)
    if (!dailyMap[key]) return
    dailyMap[key].orders += 1
    const rate = commissionByInf[o.influencer_id] || 0
    dailyMap[key].commission += orderCommission(o, commissionableOf(o), rate)
  })

  const daily = Object.values(dailyMap).map(d => ({
    ...d,
    commission: Math.round(d.commission * 100) / 100,
  }))

  // Месечна разбивка за последните 6 месеца (всички поръчки, не само recent)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const { data: monthlyOrders } = await supabaseAdmin
    .from('orders')
    .select('influencer_id, commissionable_revenue, line_items, financial_status, created_at_shopify, commission_pct')
    .gte('created_at_shopify', sixMonthsAgo.toISOString())

  const monthlyMap = {}
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixMonthsAgo)
    d.setMonth(d.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap[key] = { month: key, orders: 0, commission: 0 }
  }

  ;(monthlyOrders || []).forEach(o => {
    if (VOIDED_STATUSES.has(o.financial_status)) return
    const d = new Date(o.created_at_shopify)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthlyMap[key]) return
    monthlyMap[key].orders += 1
    const rate = commissionByInf[o.influencer_id] || 0
    monthlyMap[key].commission += orderCommission(o, commissionableOf(o), rate)
  })

  const monthly = Object.values(monthlyMap).map(m => ({
    ...m,
    commission: Math.round(m.commission * 100) / 100,
  }))

  // Топ инфлуенсъри по комисионна (за целия период)
  const { data: allOrders } = await supabaseAdmin
    .from('orders')
    .select('influencer_id, commissionable_revenue, line_items, financial_status, commission_pct')

  const byInfluencer = {}
  ;(allOrders || []).forEach(o => {
    if (VOIDED_STATUSES.has(o.financial_status)) return
    if (!byInfluencer[o.influencer_id]) {
      byInfluencer[o.influencer_id] = { orders: 0, commission: 0 }
    }
    byInfluencer[o.influencer_id].orders += 1
    const rate = commissionByInf[o.influencer_id] || 0
    byInfluencer[o.influencer_id].commission += orderCommission(o, commissionableOf(o), rate)
  })

  const topInfluencers = Object.entries(byInfluencer)
    .map(([id, v]) => ({
      id,
      name: nameByInf[id] || 'Неизвестен',
      orders: v.orders,
      commission: Math.round(v.commission * 100) / 100,
    }))
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 5)

  return NextResponse.json({ daily, monthly, topInfluencers })
}
