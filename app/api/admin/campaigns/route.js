import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildShortUrl } from '@/lib/utm'
import { createDiscountCode } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET /api/admin/campaigns            → списък с кампании (+ бр. линкове/поръчки)
// GET /api/admin/campaigns?id=<uuid>  → детайл: кампания + линкове по инфлуенсър + статистика
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id')

  if (id) {
    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns').select('*').eq('id', id).single()
    if (error || !campaign) return NextResponse.json({ error: 'Кампанията не съществува' }, { status: 404 })

    const { data: links } = await supabaseAdmin
      .from('utm_links')
      .select('id, alias, clicks, last_click_at, influencer:influencers(id, name, username, promo_code, avatar_url)')
      .eq('campaign_id', id)

    // Брой приписани поръчки по инфлуенсър
    const { data: orderRows } = await supabaseAdmin
      .from('orders')
      .select('influencer_id, commissionable_revenue')
      .eq('campaign_id', id)

    const ordersByInf = {}
    for (const o of orderRows || []) {
      const e = ordersByInf[o.influencer_id] || (ordersByInf[o.influencer_id] = { orders: 0, commissionable: 0 })
      e.orders += 1
      e.commissionable += Number(o.commissionable_revenue || 0)
    }

    const rows = (links || []).map(l => {
      const stat = ordersByInf[l.influencer?.id] || { orders: 0, commissionable: 0 }
      return {
        link_id:      l.id,
        alias:        l.alias,
        shortUrl:     buildShortUrl(l.alias),
        clicks:       l.clicks || 0,
        last_click_at: l.last_click_at,
        influencer:   l.influencer,
        orders:       stat.orders,
        commission:   Math.round(stat.commissionable * Number(campaign.commission_pct) / 100 * 100) / 100,
      }
    }).sort((a, b) => (b.clicks || 0) - (a.clicks || 0))

    return NextResponse.json({ campaign, links: rows })
  }

  const { data: campaigns, error } = await supabaseAdmin
    .from('campaigns').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Обогатяваме с брой линкове + поръчки
  const ids = (campaigns || []).map(c => c.id)
  const counts = {}
  if (ids.length) {
    const { data: lc } = await supabaseAdmin.from('utm_links').select('campaign_id').in('campaign_id', ids)
    const { data: oc } = await supabaseAdmin.from('orders').select('campaign_id').in('campaign_id', ids)
    for (const r of lc || []) (counts[r.campaign_id] ||= { links: 0, orders: 0 }).links++
    for (const r of oc || []) (counts[r.campaign_id] ||= { links: 0, orders: 0 }).orders++
  }
  const list = (campaigns || []).map(c => ({
    ...c,
    links_count:  counts[c.id]?.links  || 0,
    orders_count: counts[c.id]?.orders || 0,
  }))
  return NextResponse.json({ campaigns: list })
}

// POST /api/admin/campaigns → създаване на кампания (+ по избор създава кода в Shopify)
export async function POST(request) {
  const body = await request.json()
  const name       = (body.name || '').trim()
  const promoCode  = (body.promoCode || '').trim()
  const discount   = Number(body.customerDiscountPct)
  const commission = Number(body.commissionPct)
  const destUrl    = (body.destUrl || '').trim() || null

  if (!name || !promoCode) {
    return NextResponse.json({ error: 'Попълни име и промокод' }, { status: 400 })
  }
  if (!(discount >= 0) || !(commission >= 0)) {
    return NextResponse.json({ error: 'Невалидни проценти' }, { status: 400 })
  }

  // По желание: създаваме кода в Shopify (иначе приемаме, че вече съществува)
  if (body.createInShopify) {
    const disc = body.discount || {}
    try {
      await createDiscountCode({
        code:            promoCode,
        title:           `Кампания: ${name}`,
        valueType:       disc.valueType || 'percentage',
        value:           disc.value != null && disc.value !== '' ? disc.value : discount,
        collectionIds:   disc.appliesTo === 'collections' ? (disc.collectionIds || []) : [],
        variantIds:      disc.appliesTo === 'products'    ? (disc.variantIds || [])    : [],
        minSubtotal:     disc.minType === 'subtotal' ? disc.minValue : null,
        minQuantity:     disc.minType === 'quantity' ? disc.minValue : null,
        usageLimit:      disc.usageLimit || null,
        oncePerCustomer: !!disc.oncePerCustomer,
        startsAt:        body.startsAt || null,
        endsAt:          body.endsAt || null,
      })
    } catch (err) {
      return NextResponse.json({ error: `Shopify код: ${err.message}` }, { status: 502 })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({
      name,
      promo_code:            promoCode,
      customer_discount_pct: discount,
      commission_pct:        commission,
      dest_url:              destUrl,
      starts_at:             body.startsAt || null,
      ends_at:               body.endsAt || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/campaigns → обновяване (active / name / проценти / дати / dest)
export async function PATCH(request) {
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const updates = {}
  if ('active' in body)  updates.active = !!body.active
  if ('name' in body)    updates.name = String(body.name).trim()
  if ('destUrl' in body) updates.dest_url = String(body.destUrl).trim() || null
  if ('customerDiscountPct' in body) updates.customer_discount_pct = Number(body.customerDiscountPct)
  if ('commissionPct' in body)       updates.commission_pct = Number(body.commissionPct)
  if ('startsAt' in body) updates.starts_at = body.startsAt || null
  if ('endsAt' in body)   updates.ends_at = body.endsAt || null
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Няма промени' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('campaigns').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/admin/campaigns?id=... → трие кампанията (линковете cascade, поръчките остават с campaign_id=NULL)
export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })
  const { error } = await supabaseAdmin.from('campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
