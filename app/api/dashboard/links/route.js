import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, ensureDefaultLink } from '@/lib/share-links'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CLICK_WINDOW_DAYS = 90

// GET /api/dashboard/links → линкове + всички click статистики (от ЕДНА DB заявка)
// Връща: links (с per-link брояч), total, daily, topReferrers
// Всичко идва от един и същ snapshot на базата → броячите винаги съвпадат.
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const viewId = searchParams.get('viewId')

  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId

  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, promo_code, platform')
    .eq('id', influencerId)
    .single()

  if (inf) await ensureDefaultLink(inf)

  const since = new Date()
  since.setDate(since.getDate() - CLICK_WINDOW_DAYS)
  since.setHours(0, 0, 0, 0)

  // Тегли links + clicks (с count) едновременно
  const [linksResult, clicksResult] = await Promise.all([
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
      .gte('clicked_at', since.toISOString())
      .order('clicked_at', { ascending: false })
      .limit(2000),
  ])

  const links     = linksResult.data || []
  const clickList = clicksResult.data || []
  const total     = clicksResult.count ?? clickList.length

  // Per-link брояч (от същия dataset)
  const clicksByLink = {}
  clickList.forEach(c => {
    if (!c.link_id) return
    clicksByLink[c.link_id] = (clicksByLink[c.link_id] || 0) + 1
  })

  // Дневна разбивка (включваме днешния ден)
  const dailyMap = {}
  for (let i = 0; i <= CLICK_WINDOW_DAYS; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
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
    daily:        Object.values(dailyMap),
    topReferrers,
  })
}
