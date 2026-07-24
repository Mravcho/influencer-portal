import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateAlias, sanitizeAlias, buildShortUrl } from '@/lib/utm'
import { buildCampaignTargetUrl, SHOP_BASE_URL } from '@/lib/share-links'

export const dynamic = 'force-dynamic'

// POST /api/admin/campaigns/generate { campaignId }
// Създава по един личен UTM линк за всеки активен инфлуенсър (ако още няма).
export async function POST(request) {
  const { campaignId } = await request.json()
  if (!campaignId) return NextResponse.json({ error: 'Липсва campaignId' }, { status: 400 })

  const { data: campaign, error: cErr } = await supabaseAdmin
    .from('campaigns').select('*').eq('id', campaignId).single()
  if (cErr || !campaign) return NextResponse.json({ error: 'Кампанията не съществува' }, { status: 404 })

  const { data: influencers } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, platform')
    .eq('active', true)

  // Кои вече имат линк за тази кампания
  const { data: existing } = await supabaseAdmin
    .from('utm_links')
    .select('influencer_id')
    .eq('campaign_id', campaignId)
  const haveLink = new Set((existing || []).map(r => r.influencer_id))

  let created = 0
  const errors = []
  for (const inf of influencers || []) {
    if (haveLink.has(inf.id)) continue

    // Alias с името на инфлуенсъра (напр. maria-ivanova). Ако името е на кирилица
    // → пробваме username; краен fallback — случаен. При колизия добавяме -2, -3...
    const base = sanitizeAlias(inf.name) || sanitizeAlias(inf.username) || generateAlias(6)
    let inserted = false
    for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
      const alias = attempt === 0
        ? base
        : attempt < 5 ? `${base}-${attempt + 1}` : `${base}-${generateAlias(3)}`
      const fullUrl = buildCampaignTargetUrl({
        promoCode:   campaign.promo_code,
        campaignKey: campaign.promo_code,
        platform:    inf.platform,
        alias,
        destUrl:     campaign.dest_url,
      })
      const { error } = await supabaseAdmin.from('utm_links').insert({
        alias,
        label:        `${campaign.name} — ${inf.name}`,
        dest_url:     campaign.dest_url || SHOP_BASE_URL,
        full_url:     fullUrl,
        utm_source:   'influencer_portal',
        utm_medium:   (inf.platform || 'social').toLowerCase().replace(/[^a-z0-9]/g, ''),
        utm_campaign: campaign.promo_code,
        utm_content:  alias,
        influencer_id: inf.id,
        campaign_id:   campaignId,
      })
      if (!error) { inserted = true; created++ }
      else if (error.code !== '23505') { errors.push(`${inf.name}: ${error.message}`); break }
      // 23505 = дублиран alias → нов опит
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    total_influencers: (influencers || []).length,
    already_had: haveLink.size,
    errors,
  })
}
