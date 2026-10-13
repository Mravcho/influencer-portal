import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, ensureDefaultLink } from '@/lib/share-links'
import { codeColumns, activeCodeOf, isBoostActive } from '@/lib/influencer-codes'
import { fetchAllRows } from '@/lib/order-status'

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
    .select(['id, promo_code, platform', ...await codeColumns()].join(', '))
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

    // Supabase връща най-много 1000 реда на заявка → теглим на страници, иначе
    // кликовете по линк и графиката спират на 1000
    fetchAllRows((from, to) => supabaseAdmin
      .from('link_clicks')
      .select('id, link_id, clicked_at, referrer')
      .eq('influencer_id', influencerId)
      .gte('clicked_at', rangeFrom.toISOString())
      .lte('clicked_at', rangeTo.toISOString())
      .order('clicked_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to), { max: 50000 }).then(data => ({ data }), () => ({ data: [] })),

    supabaseAdmin
      .from('link_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('influencer_id', influencerId),
  ])

  // Линковете с кодове: един за основния код (5%) и един за 10% кода, всеки със
  // своите кликове. Този на неактивния в момента код се показва като неактивен
  // (и води към активния код). Линковете със стари кодове не се показват отделно —
  // кликовете им се броят към линка на основния код.
  const low        = c => String(c || '').toLowerCase()
  const activeCode = inf ? activeCodeOf(inf, await isBoostActive()) : null
  const ownShort   = new Set([inf?.promo_code, inf?.boost_code, ...(inf?.old_codes || [])].filter(Boolean).map(low))
  const allLinks   = linksResult.data || []
  const codeLinks  = allLinks.filter(l => l.is_default || ownShort.has(low(l.short_code)))
  const boostLink  = inf?.boost_code ? codeLinks.find(l => low(l.short_code) === low(inf.boost_code)) || null : null
  const promoLink  = codeLinks.find(l => low(l.short_code) === low(inf?.promo_code))
                  || codeLinks.find(l => l.is_default && l !== boostLink) || null
  const codeOfLink = new Map()
  if (promoLink) codeOfLink.set(promoLink.id, String(inf.promo_code || '').toUpperCase())
  if (boostLink) codeOfLink.set(boostLink.id, String(inf.boost_code).toUpperCase())
  const hiddenIds  = new Set(codeLinks.filter(l => !codeOfLink.has(l.id)).map(l => l.id))
  const links      = allLinks
    .filter(l => !hiddenIds.has(l.id))
    // Активният код най-отгоре
    .sort((a, b) => (codeOfLink.get(b.id) === activeCode) - (codeOfLink.get(a.id) === activeCode))
  const defaultLinkId = promoLink?.id
  const clickList     = clicksResult.data || []
  const total         = clickList.length
  const lifetimeTotal = lifetimeResult.count ?? 0

  // Per-link брояч (от същия dataset)
  const clicksByLink = {}
  clickList.forEach(c => {
    if (!c.link_id) return
    const id = hiddenIds.has(c.link_id) && defaultLinkId ? defaultLinkId : c.link_id
    clicksByLink[id] = (clicksByLink[id] || 0) + 1
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
    is_default:     codeOfLink.has(l.id) || l.is_default,
    code:           codeOfLink.get(l.id) || null,
    // Линк с код, който в момента не е активен (напр. 10% извън 10% период)
    inactive:       codeOfLink.has(l.id) && codeOfLink.get(l.id) !== activeCode,
    active_code:    activeCode,
    clicks:         clicksByLink[l.id] || 0,
    target_preview: activeCode ? buildShopifyDiscountUrl(activeCode, inf.platform) : null,
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
