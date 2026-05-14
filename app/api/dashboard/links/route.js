import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShopifyDiscountUrl, generateShortCode, ensureDefaultLink } from '@/lib/share-links'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/links → моите линкове + click counts
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const viewId = searchParams.get('viewId')

  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId

  // Взимаме инфлуенсъра — нужен за ensureDefaultLink
  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, promo_code')
    .eq('id', influencerId)
    .single()

  if (inf) {
    await ensureDefaultLink(inf)
  }

  const { data: links } = await supabaseAdmin
    .from('share_links')
    .select('id, short_code, target_url, label, is_default, created_at')
    .eq('influencer_id', influencerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  // Брой кликове за всеки линк (отделна заявка)
  const linkIds = (links || []).map(l => l.id)
  const clicksByLink = {}
  if (linkIds.length > 0) {
    const { data: clicks } = await supabaseAdmin
      .from('link_clicks')
      .select('link_id')
      .in('link_id', linkIds)
    ;(clicks || []).forEach(c => {
      if (!c.link_id) return
      clicksByLink[c.link_id] = (clicksByLink[c.link_id] || 0) + 1
    })
  }

  return NextResponse.json({
    links: (links || []).map(l => ({ ...l, clicks: clicksByLink[l.id] || 0 })),
  })
}

// POST /api/dashboard/links { redirect_path, label } → нов custom линк
export async function POST(request) {
  const userRole = request.headers.get('x-user-role')
  if (userRole === 'admin') {
    return NextResponse.json({ error: 'Admin не създава линкове на инфлуенсъри' }, { status: 403 })
  }
  const influencerId = request.headers.get('x-user-id')

  const body = await request.json()
  const redirectPath = (body.redirect_path || '/').trim() || '/'
  const label = body.label?.trim() || null

  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, promo_code')
    .eq('id', influencerId)
    .single()
  if (!inf) return NextResponse.json({ error: 'Инфлуенсърът не съществува' }, { status: 404 })

  const targetUrl = buildShopifyDiscountUrl(inf.promo_code, redirectPath)

  // Генерираме уникален short code (опит до 5 пъти)
  let shortCode = generateShortCode()
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabaseAdmin
      .from('share_links')
      .select('id')
      .eq('short_code', shortCode)
      .maybeSingle()
    if (!existing) break
    shortCode = generateShortCode()
  }

  const { data, error } = await supabaseAdmin
    .from('share_links')
    .insert({
      influencer_id: influencerId,
      short_code:    shortCode,
      target_url:    targetUrl,
      label,
      is_default:    false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/dashboard/links?id=uuid → изтрива линк (без default-а)
export async function DELETE(request) {
  const influencerId = request.headers.get('x-user-id')
  const userRole     = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const { data: link } = await supabaseAdmin
    .from('share_links')
    .select('id, influencer_id, is_default')
    .eq('id', id)
    .single()

  if (!link) return NextResponse.json({ error: 'Не съществува' }, { status: 404 })
  if (userRole !== 'admin' && link.influencer_id !== influencerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (link.is_default) {
    return NextResponse.json({ error: 'Не може да изтриеш default линка' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('share_links').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
