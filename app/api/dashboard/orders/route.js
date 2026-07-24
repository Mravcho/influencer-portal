import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { orderCommission } from '@/lib/commission'

// Поръчки със следните статуси не носят комисионна и не се броят в общата сума
const VOIDED_STATUSES = new Set(['voided', 'refunded'])
function isVoided(order) {
  return VOIDED_STATUSES.has(order.financial_status)
}

function getCommissionable(order) {
  if (isVoided(order)) return 0
  const stored = parseFloat(order.commissionable_revenue)
  if (stored > 0) return stored
  return (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.price || 0) * (item.quantity || 1), 0
  )
}

function getSavings(order) {
  if (isVoided(order)) return 0
  const stored = parseFloat(order.total_savings)
  if (stored > 0) return stored
  return (order.line_items || []).reduce(
    (s, item) => s + parseFloat(item.discount_amount || 0), 0
  )
}

function getShipping(order) {
  if (isVoided(order)) return 0
  return parseFloat(order.shipping_total || 0)
}

function getPaid(order) {
  if (isVoided(order)) return 0
  return parseFloat(order.total_price || 0)
}

export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const days   = parseInt(searchParams.get('days') || '0')
  const from   = searchParams.get('from') // YYYY-MM-DD
  const to     = searchParams.get('to')   // YYYY-MM-DD
  const viewId = searchParams.get('viewId') // за admin преглед на инфлуенсър

  // Admin може да разглежда поръчките на всеки инфлуенсър чрез ?viewId=
  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) {
    influencerId = viewId
  }

  // Винаги взимаме commission директно от базата (НЕ от JWT хедъра),
  // за да отрази веднага промени от admin без да изисква re-login.
  // commission ще бъде заредена заедно с profile-а няколко реда по-долу.
  let commission = 0

  // Тегли banner_url + avatar_url + name + commission на инфлуенсъра + default banner (fallback)
  const [{ data: profile }, { data: brandingRow }] = await Promise.all([
    supabaseAdmin
      .from('influencers')
      .select('name, banner_url, avatar_url, platform, promo_code, commission')
      .eq('id', influencerId)
      .single(),
    supabaseAdmin
      .from('branding')
      .select('default_banner_url')
      .eq('id', 1)
      .maybeSingle(),
  ])

  const effectiveBanner = profile?.banner_url || brandingRow?.default_banner_url || null
  commission = parseFloat(profile?.commission || 0)

  let query = supabaseAdmin
    .from('orders')
    .select('*')
    .eq('influencer_id', influencerId)
    .order('created_at_shopify', { ascending: false })

  // Custom range (from/to) има приоритет над days
  if (from) {
    query = query.gte('created_at_shopify', new Date(from).toISOString())
  }
  if (to) {
    // Включваме целия ден на крайната дата
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    query = query.lte('created_at_shopify', end.toISOString())
  }
  if (!from && !to && days > 0) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    query = query.gte('created_at_shopify', since.toISOString())
  }

  const { data: raw, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orders = raw.map(o => ({
    ...o,
    total_price:            Math.round(getPaid(o) * 100) / 100,
    commissionable_revenue: Math.round(getCommissionable(o) * 100) / 100,
    total_savings:          Math.round(getSavings(o) * 100) / 100,
    shipping_total:         Math.round(getShipping(o) * 100) / 100,
    voided:                 isVoided(o),
  }))

  const totalRevenue          = orders.reduce((s, o) => s + o.total_price, 0)
  const commissionableRevenue = orders.reduce((s, o) => s + o.commissionable_revenue, 0)
  const totalSavings          = orders.reduce((s, o) => s + o.total_savings, 0)
  // Комисионна per-order: кампанийните носят своя ставка (o.commission_pct), иначе ставката на инфлуенсъра
  const totalCommission       = orders.reduce((s, o) => s + orderCommission(o, o.commissionable_revenue, commission), 0)
  const activeOrdersCount     = orders.filter(o => !o.voided).length

  const productMap = {}
  orders.forEach(order => {
    if (order.voided) return
    ;(order.line_items || []).forEach(item => {
      if (item.discounted === false) return
      const key = item.title
      if (!productMap[key]) productMap[key] = { title: key, quantity: 0, revenue: 0, image_url: item.image_url || null }
      if (!productMap[key].image_url && item.image_url) productMap[key].image_url = item.image_url
      productMap[key].quantity += item.quantity
      productMap[key].revenue  += item.quantity * parseFloat(item.price)
    })
  })

  // Текущ месец stats — независими от филтъра (за hero "Очаквана комисионна")
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data: monthRaw } = await supabaseAdmin
    .from('orders')
    .select('total_price, commissionable_revenue, total_savings, line_items, financial_status, commission_pct')
    .eq('influencer_id', influencerId)
    .gte('created_at_shopify', monthStart.toISOString())

  const monthOrders = (monthRaw || []).filter(o => !isVoided(o))
  const monthCommission     = monthOrders.reduce((s, o) => s + orderCommission(o, getCommissionable(o), commission), 0)
  const monthSavings        = monthOrders.reduce((s, o) => s + getSavings(o), 0)

  return NextResponse.json({
    orders,
    commission,
    bannerUrl: effectiveBanner,
    avatarUrl: profile?.avatar_url || null,
    name:      profile?.name || null,
    platform:  profile?.platform || null,
    promoCode: profile?.promo_code || null,
    currentMonth: {
      orders:     monthOrders.length,
      commission: Math.round(monthCommission * 100) / 100,
      savings:    Math.round(monthSavings    * 100) / 100,
    },
    stats: {
      totalOrders:           activeOrdersCount,
      voidedCount:           orders.length - activeOrdersCount,
      totalRevenue:          Math.round(totalRevenue * 100) / 100,
      commissionableRevenue: Math.round(commissionableRevenue * 100) / 100,
      totalCommission:       Math.round(totalCommission * 100) / 100,
      totalSavings:          Math.round(totalSavings * 100) / 100,
      avgOrderValue:         activeOrdersCount
        ? Math.round((totalRevenue / activeOrdersCount) * 100) / 100
        : 0,
    },
    topProducts: Object.values(productMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
  })
}
