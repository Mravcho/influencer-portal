import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function getCommissionable(order) {
  const stored = parseFloat(order.commissionable_revenue)
  if (stored > 0) return stored
  return (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
}

function getSavings(order) {
  const stored = parseFloat(order.total_savings)
  if (stored > 0) return stored
  return (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.discount_amount || 0), 0
  )
}

function getShipping(order) {
  return parseFloat(order.shipping_total || 0)
}

export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const days   = parseInt(searchParams.get('days') || '0')
  const viewId = searchParams.get('viewId') // за admin преглед на инфлуенсър

  // Admin може да разглежда поръчките на всеки инфлуенсър чрез ?viewId=
  let influencerId = request.headers.get('x-user-id')
  let commission   = parseFloat(request.headers.get('x-commission') || '0')

  if (userRole === 'admin' && viewId) {
    influencerId = viewId
    const { data: inf } = await supabaseAdmin
      .from('influencers')
      .select('commission')
      .eq('id', viewId)
      .single()
    commission = parseFloat(inf?.commission || 0)
  }

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

  const orders = raw.map(o => ({
    ...o,
    commissionable_revenue: Math.round(getCommissionable(o) * 100) / 100,
    total_savings:          Math.round(getSavings(o) * 100) / 100,
    shipping_total:         Math.round(getShipping(o) * 100) / 100,
  }))

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
    commission,
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
