import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, isBot } from '@/lib/share-links'

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
  if (!code) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 1. Опитваме се да намерим share_link по short_code
  let link = null
  const { data: linkRow } = await supabaseAdmin
    .from('share_links')
    .select('id, influencer_id, target_url')
    .eq('short_code', code)
    .maybeSingle()
  link = linkRow

  // 2. Fallback: ако няма share_link, намираме инфлуенсър по промо код
  //    Това позволява старите URL-и да работят дори без явно създадени share_links.
  let influencerId = link?.influencer_id || null
  let targetUrl    = link?.target_url    || null

  if (!link) {
    const { data: inf } = await supabaseAdmin
      .from('influencers')
      .select('id, promo_code')
      .ilike('promo_code', code)
      .maybeSingle()
    if (inf) {
      influencerId = inf.id
      targetUrl    = buildShopifyDiscountUrl(inf.promo_code, '/')
    }
  }

  // Няма match → пренасочваме към магазина без промо
  if (!targetUrl) {
    return NextResponse.redirect(process.env.SHOP_BASE_URL || 'https://realfood.bg', 302)
  }

  // 3. Записваме клика — само ако НЕ е bot/crawler (social preview не се брои)
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
