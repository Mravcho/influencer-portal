import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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

  const { data: orders, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Агрегирани stats
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.total_price), 0)
  const commission   = parseFloat(request.headers.get('x-commission') || '0')
  const totalCommission = totalRevenue * (commission / 100)

  const productMap = {}
  orders.forEach(order => {
    ;(order.line_items || []).forEach(item => {
      const key = item.title
      if (!productMap[key]) productMap[key] = { title: key, quantity: 0, revenue: 0 }
      productMap[key].quantity += item.quantity
      productMap[key].revenue  += item.quantity * parseFloat(item.price)
    })
  })

  return NextResponse.json({
    orders,
    stats: {
      totalOrders:    orders.length,
      totalRevenue:   Math.round(totalRevenue * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      avgOrderValue:  orders.length
        ? Math.round((totalRevenue / orders.length) * 100) / 100
        : 0,
    },
    topProducts: Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
  })
}
