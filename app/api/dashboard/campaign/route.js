import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShortUrl } from '@/lib/utm'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/campaign → активните кампании на логнатия инфлуенсър + личния му линк
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const viewId   = new URL(request.url).searchParams.get('viewId')

  // Admin може да разглежда кампаниите на конкретен инфлуенсър чрез ?viewId=
  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  // Линковете на инфлуенсъра, които са към кампания
  const { data: links } = await supabaseAdmin
    .from('utm_links')
    .select('alias, clicks, campaign:campaigns(id, name, promo_code, customer_discount_pct, commission_pct, active, ends_at, archived)')
    .eq('influencer_id', influencerId)
    .not('campaign_id', 'is', null)

  const now = Date.now()
  const campaigns = (links || [])
    .filter(l => l.campaign && !l.campaign.archived) // спрените се показват grayed; архивираните (изтритите) — не
    .map(l => {
      const c = l.campaign
      const expired = c.ends_at ? new Date(c.ends_at).getTime() < now : false
      const isActive = !!c.active && !expired
      return {
        id:                    c.id,
        name:                  c.name,
        promo_code:            c.promo_code,
        customer_discount_pct: c.customer_discount_pct,
        commission_pct:        c.commission_pct,
        ends_at:               c.ends_at,
        active:                isActive,
        expired,
        clicks:                l.clicks || 0,
        link:                  buildShortUrl(l.alias),
      }
    })
    // Активните най-отгоре
    .sort((a, b) => (b.active === a.active ? 0 : b.active ? 1 : -1))

  // Поръчки + комисионна от кампанията за този инфлуенсър
  const campaignIds = campaigns.map(c => c.id)
  const statsById = {}
  if (campaignIds.length) {
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('campaign_id, commissionable_revenue, commission_pct, financial_status')
      .eq('influencer_id', influencerId)
      .in('campaign_id', campaignIds)
    for (const o of orders || []) {
      if (o.financial_status === 'voided' || o.financial_status === 'refunded') continue
      const s = statsById[o.campaign_id] || (statsById[o.campaign_id] = { orders: 0, commission: 0 })
      s.orders += 1
      s.commission += Number(o.commissionable_revenue || 0) * Number(o.commission_pct || 0) / 100
    }
  }

  const withStats = campaigns.map(c => ({
    ...c,
    orders:     statsById[c.id]?.orders || 0,
    commission: Math.round((statsById[c.id]?.commission || 0) * 100) / 100,
  }))

  return NextResponse.json({ campaigns: withStats }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}
