import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, isBot, SHOP_BASE_URL } from '@/lib/share-links'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function extractClientInfo(request) {
  const ip =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  return {
    ip_address: ip,
    user_agent: request.headers.get('user-agent') || null,
    country:    request.headers.get('x-vercel-ip-country') || null,
    city:       request.headers.get('x-vercel-ip-city')
                  ? decodeURIComponent(request.headers.get('x-vercel-ip-city'))
                  : null,
    referrer:   request.headers.get('referer') || null,
  }
}

export async function GET(request, { params }) {
  const code = (params?.code || '').toLowerCase()
  if (!code) return NextResponse.redirect(SHOP_BASE_URL)

  // 1. Намираме share_link → влъжваме инфлуенсъра
  const { data: link } = await supabaseAdmin
    .from('share_links')
    .select('id, influencer_id')
    .eq('short_code', code)
    .maybeSingle()

  let influencerId = link?.influencer_id || null
  let influencer   = null

  if (influencerId) {
    const { data: inf } = await supabaseAdmin
      .from('influencers')
      .select('id, promo_code, platform')
      .eq('id', influencerId)
      .single()
    influencer = inf
  } else {
    // Fallback: ако няма share_link, търсим по промо код директно
    const { data: inf } = await supabaseAdmin
      .from('influencers')
      .select('id, promo_code, platform')
      .ilike('promo_code', code)
      .maybeSingle()
    influencer = inf
    influencerId = inf?.id || null
  }

  // Няма match → пренасочваме към магазина
  if (!influencer) return NextResponse.redirect(SHOP_BASE_URL, 302)

  // Изграждаме target dynamically — UTM-те винаги отразяват текущата платформа/промо код
  const targetUrl = buildShopifyDiscountUrl(influencer.promo_code, influencer.platform)

  // Записваме клика — само ако НЕ е bot
  const clientInfo = extractClientInfo(request)
  if (!isBot(clientInfo.user_agent) && influencerId) {
    try {
      await supabaseAdmin.from('link_clicks').insert({
        link_id:       link?.id || null,
        influencer_id: influencerId,
        ...clientInfo,
      })
    } catch (err) {
      console.error('link_click insert failed:', err.message)
    }
  }

  return NextResponse.redirect(targetUrl, 302)
}
