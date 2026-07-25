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

  let created = 0
  let reused = 0
  const errors = []

  // Ред за utm_links за даден alias (repoint към ТАЗИ кампания)
  const rowFor = (inf, alias, medium) => ({
    alias,
    label:        `${campaign.name} — ${inf.name}`,
    dest_url:     campaign.dest_url || SHOP_BASE_URL,
    full_url:     buildCampaignTargetUrl({
      promoCode:   campaign.promo_code,
      campaignKey: campaign.promo_code,
      platform:    inf.platform,
      alias,
      destUrl:     campaign.dest_url,
    }),
    utm_source:   'influencer_portal',
    utm_medium:   medium,
    utm_campaign: campaign.promo_code,
    utm_content:  alias,
    influencer_id: inf.id,
    campaign_id:   campaignId,
  })

  for (const inf of influencers || []) {
    const firstName = (inf.name || '').trim().split(/\s+/)[0]
    const base   = sanitizeAlias(firstName) || sanitizeAlias(inf.username) || generateAlias(6)
    const medium = (inf.platform || 'social').toLowerCase().replace(/[^a-z0-9]/g, '')

    // Съществуващи кампанийни линкове на инфлуенсъра (от която и да е кампания)
    const { data: links } = await supabaseAdmin
      .from('utm_links')
      .select('id, alias, created_at')
      .eq('influencer_id', inf.id)
      .not('campaign_id', 'is', null)
      .order('created_at', { ascending: true })

    if (links && links.length > 0) {
      // Пазим ЕДИН стабилен линк. Предпочитаме този с чистото първо име.
      const primary = links.find(l => l.alias === base) || links[0]
      // Трием дубликатите (консолидация до 1 линк на инфлуенсър)
      const dupIds = links.filter(l => l.id !== primary.id).map(l => l.id)
      if (dupIds.length) await supabaseAdmin.from('utm_links').delete().in('id', dupIds)

      // Ако alias-ът не е чистото първо име, а то е свободно → минаваме на него
      let alias = primary.alias
      if (alias !== base) {
        const { data: taken } = await supabaseAdmin
          .from('utm_links').select('id').eq('alias', base).neq('id', primary.id).maybeSingle()
        if (!taken) alias = base
      }

      // Repoint: сменяме само пренасочването/кампанията, alias-ът (линкът) остава
      const { error } = await supabaseAdmin
        .from('utm_links').update(rowFor(inf, alias, medium)).eq('id', primary.id)
      if (error) errors.push(`${inf.name}: ${error.message}`)
      else reused++
    } else {
      // Няма линк още → създаваме с чистото първо име (колизия само срещу др. инфлуенсъри)
      let inserted = false
      for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
        const alias = attempt === 0
          ? base
          : attempt < 5 ? `${base}-${attempt + 1}` : `${base}-${generateAlias(3)}`
        const { error } = await supabaseAdmin.from('utm_links').insert(rowFor(inf, alias, medium))
        if (!error) { inserted = true; created++ }
        else if (error.code !== '23505') { errors.push(`${inf.name}: ${error.message}`); break }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    reused,
    total_influencers: (influencers || []).length,
    errors,
  })
}
