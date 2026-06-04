import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, ensureDefaultLink } from '@/lib/share-links'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DEFAULT_WINDOW_DAYS = 30

// GET /api/dashboard/links → линкове + click статистики за избран период
// Query: from, to (YYYY-MM-DD), или days (по подразбиране 30)
// Връща: links (с per-link брояч за периода), total (за периода), lifetimeTotal (от началото),
//        daily, topReferrers, rangeFrom, rangeTo
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const viewId = searchParams.get('viewId')
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')
  const daysParam = parseInt(searchParams.get('days') || '')

  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId

  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, promo_code, platform')
    .eq('id', influencerId)
    .single()

  if (inf) await ensureDefaultLink(inf)

  // Определяме периода
  let rangeFrom, rangeTo
  if (fromParam || toParam) {
    rangeFrom = fromParam ? new Date(fromParam + 'T00:00:00.000Z') : new Date('2020-01-01T00:00:00.000Z')
    rangeTo   = toParam   ? new Date(toParam   + 'T23:59:59.999Z') : new Date()
  } else {
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : DEFAULT_WINDOW_DAYS
    rangeTo   = new Date()
    rangeFrom = new Date()
    rangeFrom.setDate(rangeFrom.getDate() - days)
    rangeFrom.setHours(0, 0, 0, 0)
  }

  // Тегли links + clicks (с count) за периода + lifetime count (отделна заявка)
  const [linksResult, clicksResult, lifetimeResult] = await Promise.all([
    supabaseAdmin
      .from('share_links')
      .select('id, short_code, label, is_default, created_at')
      .eq('influencer_id', influencerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),

    supabaseAdmin
      .from('link_clicks')
      .select('id, link_id, clicked_at, referrer', { count: 'exact' })
      .eq('influencer_id', influencerId)
      .gte('clicked_at', rangeFrom.toISOString())
      .lte('clicked_at', rangeTo.toISOString())
      .order('clicked_at', { ascending: false })
      .limit(5000),

    supabaseAdmin
      .from('link_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('influencer_id', influencerId),
  ])

  const links         = linksResult.data || []
  const clickList     = clicksResult.data || []
  const total         = clicksResult.count ?? clickList.length
  const lifetimeTotal = lifetimeResult.count ?? 0

  // Per-link брояч (от същия dataset)
  const clicksByLink = {}
  clickList.forEach(c => {
    if (!c.link_id) return
    clicksByLink[c.link_id] = (clicksByLink[c.link_id] || 0) + 1
  })

  // Дневна разбивка между rangeFrom и rangeTo (включително)
  const dailyMap = {}
  const startDay = new Date(rangeFrom); startDay.setHours(0, 0, 0, 0)
  const endDay   = new Date(rangeTo);   endDay.setHours(0, 0, 0, 0)
  for (let d = new Date(startDay); d.getTime() <= endDay.getTime(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { date: key, count: 0 }
  }
  clickList.forEach(c => {
    const key = c.clicked_at.slice(0, 10)
    if (dailyMap[key]) dailyMap[key].count += 1
  })

  // Top referrers (host names)
  const refMap = {}
  clickList.forEach(c => {
    if (!c.referrer) return
    try {
      const host = new URL(c.referrer).hostname
      refMap[host] = (refMap[host] || 0) + 1
    } catch {}
  })
  const topReferrers = Object.entries(refMap)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const enriched = links.map(l => ({
    ...l,
    clicks:         clicksByLink[l.id] || 0,
    target_preview: inf ? buildShopifyDiscountUrl(inf.promo_code, inf.platform) : null,
  }))

  return NextResponse.json({
    links:        enriched,
    total,
    lifetimeTotal,
    daily:        Object.values(dailyMap),
    topReferrers,
    rangeFrom:    rangeFrom.toISOString(),
    rangeTo:      rangeTo.toISOString(),
  })
}
