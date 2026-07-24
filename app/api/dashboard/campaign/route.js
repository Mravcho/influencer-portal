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
    .select('alias, clicks, campaign:campaigns(id, name, promo_code, customer_discount_pct, commission_pct, active, ends_at)')
    .eq('influencer_id', influencerId)
    .not('campaign_id', 'is', null)

  const campaigns = (links || [])
    .filter(l => l.campaign && l.campaign.active)
    .map(l => ({
      id:                    l.campaign.id,
      name:                  l.campaign.name,
      promo_code:            l.campaign.promo_code,
      customer_discount_pct: l.campaign.customer_discount_pct,
      commission_pct:        l.campaign.commission_pct,
      ends_at:               l.campaign.ends_at,
      clicks:                l.clicks || 0,
      link:                  buildShortUrl(l.alias),
    }))

  return NextResponse.json({ campaigns })
}
