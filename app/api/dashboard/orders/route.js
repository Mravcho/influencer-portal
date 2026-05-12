import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function getCommissionable(order) {
  const stored = parseFloat(order.commissionable_revenue)
  if (stored > 0) return stored
  // Стари поръчки: пълната цена на всички продукти
  return (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
}

function getSavings(order) {
  const stored = parseFloat(order.total_savings)
  if (stored > 0) return stored
  // Ако line_items имат discount_amount (нов формат)
  const fromItems = (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.discount_amount || 0), 0
  )
  if (fromItems > 0) return fromItems
  // Апроксимация за стари поръчки: пълна цена − платена цена − доставка
  const fullPrice = (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
  const shipping = parseFloat(order.shipping_total || 0)
  return Math.max(0, Math.round((fullPrice - parseFloat(order.total_price || 0) + shipping) * 100) / 100)
}

export async function GET(request) {
  const influencerId = request.headers.get('x-user-id')
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '0')

  let query = supabaseAdmin
    .from('orders')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at_shopify', { ascending: false })

  if (days > 0) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    query = query.gte('created_at_shopify', since.toISOString())
  }

  const { data: raw, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Попълваме изчислените полета за всяка поръчка (null за стари)
  const orders = raw.map(o => ({
    ...o,
    commissionable_revenue: Math.round(getCommissionable(o) * 100) / 100,
    total_savings:          Math.round(getSavings(o) * 100) / 100,
    shipping_total:         parseFloat(o.shipping_total || 0),
  }))

  const commission = parseFloat(request.headers.get('x-commission') || '0')

  const totalRevenue          = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0)
  const commissionableRevenue = orders.reduce((s, o) => s + o.commissionable_revenue, 0)
  const totalSavings          = orders.reduce((s, o) => s + o.total_savings, 0)
  const totalCommission       = commissionableRevenue * (commission / 100)

  const productMap = {}
  orders.forEach(order => {
    ;(order.line_items || []).forEach(item => {
      if (item.discounted === false) return
      const key = item.title
      if (!productMap[key]) productMap[key] = { title: key, quantity: 0, revenue: 0 }
      productMap[key].quantity += item.quantity
      productMap[key].revenue  += item.quantity * parseFloat(item.price)
    })
  })

  return NextResponse.json({
    orders,
    stats: {
      totalOrders:           orders.length,
      totalRevenue:          Math.round(totalRevenue * 100) / 100,
      commissionableRevenue: Math.round(commissionableRevenue * 100) / 100,
      totalCommission:       Math.round(totalCommission * 100) / 100,
      totalSavings:          Math.round(totalSavings * 100) / 100,
      avgOrderValue:         orders.length
        ? Math.round((totalRevenue / orders.length) * 100) / 100
        : 0,
    },
    topProducts: Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
  })
}
