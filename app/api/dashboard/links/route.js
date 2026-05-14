import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, ensureDefaultLink } from '@/lib/share-links'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CLICK_WINDOW_DAYS = 90

// GET /api/dashboard/links → моите линкове + click counts (90 дни)
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const viewId = searchParams.get('viewId')

  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId

  // Взимаме инфлуенсъра — нужен за UTM-те и за ensureDefaultLink
  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, promo_code, platform')
    .eq('id', influencerId)
    .single()

  if (inf) await ensureDefaultLink(inf)

  const { data: links } = await supabaseAdmin
    .from('share_links')
    .select('id, short_code, label, is_default, created_at')
    .eq('influencer_id', influencerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  // Click count за всеки линк (същия 90-дневен прозорец както в /clicks)
  const since = new Date()
  since.setDate(since.getDate() - CLICK_WINDOW_DAYS)
  since.setHours(0, 0, 0, 0)

  const clicksByLink = {}
  const linkIds = (links || []).map(l => l.id)
  if (linkIds.length > 0) {
    const { data: clicks } = await supabaseAdmin
      .from('link_clicks')
      .select('link_id')
      .in('link_id', linkIds)
      .gte('clicked_at', since.toISOString())
    ;(clicks || []).forEach(c => {
      if (!c.link_id) return
      clicksByLink[c.link_id] = (clicksByLink[c.link_id] || 0) + 1
    })
  }

  // target_preview изграждаме dynamically — отразява текущите UTM-и
  const enriched = (links || []).map(l => ({
    ...l,
    clicks:         clicksByLink[l.id] || 0,
    target_preview: inf ? buildShopifyDiscountUrl(inf.promo_code, inf.platform) : null,
  }))

  return NextResponse.json({ links: enriched })
}
