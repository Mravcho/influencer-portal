import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildUtmUrl, buildShortUrl, generateAlias, sanitizeAlias } from '@/lib/utm'

export const dynamic = 'force-dynamic'

// GET /api/admin/utm-links → all links + aggregate stats
export async function GET() {
  const { data: links, error } = await supabaseAdmin
    .from('utm_links')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = links || []
  const withShort = list.map((l) => ({ ...l, shortUrl: buildShortUrl(l.alias) }))
  const bySource = {}, byMedium = {}, byCampaign = {}
  for (const l of list) {
    if (l.utm_source)   bySource[l.utm_source]     = (bySource[l.utm_source]   || 0) + l.clicks
    if (l.utm_medium)   byMedium[l.utm_medium]     = (byMedium[l.utm_medium]   || 0) + l.clicks
    if (l.utm_campaign) byCampaign[l.utm_campaign] = (byCampaign[l.utm_campaign] || 0) + l.clicks
  }
  return NextResponse.json({
    links: withShort,
    stats: {
      totalLinks: list.length,
      totalClicks: list.reduce((s, l) => s + (l.clicks || 0), 0),
      bySource, byMedium, byCampaign,
      topLinks: [...withShort].sort((a, b) => b.clicks - a.clicks).slice(0, 10),
    },
  })
}

// POST /api/admin/utm-links → create a link
export async function POST(request) {
  const body = await request.json()
  const destUrl  = (body.destUrl  || '').trim()
  const source   = (body.source   || '').trim()
  const medium   = (body.medium   || '').trim()
  const campaign = (body.campaign || '').trim()

  if (!destUrl || !source || !medium || !campaign) {
    return NextResponse.json({ error: 'Попълни задължителните полета (URL, source, medium, campaign)' }, { status: 400 })
  }

  const alias = body.alias ? sanitizeAlias(body.alias) : generateAlias()
  if (!alias) return NextResponse.json({ error: 'Невалиден alias' }, { status: 400 })

  let fullUrl
  try {
    fullUrl = buildUtmUrl({ destUrl, source, medium, campaign, term: body.term, content: body.content, utmId: body.utmId, alias })
  } catch {
    return NextResponse.json({ error: 'Невалиден Destination URL' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('utm_links')
    .insert({
      alias,
      label:        body.label || null,
      dest_url:     destUrl,
      full_url:     fullUrl,
      utm_source:   source,
      utm_medium:   medium,
      utm_campaign: campaign,
      utm_term:     body.term    || null,
      utm_content:  body.content || null,
      utm_id:       body.utmId   || null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Този alias вече съществува' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ...data, shortUrl: buildShortUrl(alias) })
}

// PATCH /api/admin/utm-links → update label / active
export async function PATCH(request) {
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const updates = {}
  if ('active' in body) updates.active = !!body.active
  if ('label'  in body) updates.label  = body.label || null
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Няма промени' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('utm_links')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, shortUrl: buildShortUrl(data.alias) })
}

// DELETE /api/admin/utm-links?id=... → delete link (cascade daily clicks)
export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })
  const { error } = await supabaseAdmin.from('utm_links').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
