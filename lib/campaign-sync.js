import { supabaseAdmin } from './supabase'
import { fetchOrdersByPromoCode, fetchOrderUtmContent } from './shopify'
import { extractCampaignAlias } from './share-links'
import { sendNewOrderNotification } from './email'

// Намира активна кампания, чийто код е сред кодовете на поръчката (case-insensitive).
export async function findActiveCampaignByCodes(codesUpper) {
  if (!codesUpper || codesUpper.length === 0) return null
  const { data } = await supabaseAdmin.from('campaigns').select('*').eq('active', true)
  return (data || []).find(c => codesUpper.includes(String(c.promo_code).toUpperCase())) || null
}

// Намира инфлуенсъра за поръчка от дадена кампания по UTM (Customer Journey → landing резерв).
// Връща { influencer, alias } или null.
export async function resolveCampaignInfluencer(campaign, orderId, landingSite) {
  let alias = await fetchOrderUtmContent(orderId)
  if (!alias) alias = extractCampaignAlias(landingSite)
  if (!alias) return null
  const { data: link } = await supabaseAdmin
    .from('utm_links')
    .select('influencer:influencers(id, name, email, promo_code, commission, email_notifications)')
    .eq('campaign_id', campaign.id)
    .eq('alias', alias)
    .maybeSingle()
  return link?.influencer ? { influencer: link.influencer, alias } : null
}

// Пълен синк на кампания (за cron/backfill). Приписва поръчките по UTM и праща мейл за новите.
export async function syncCampaign(campaign, { sinceOverride = null } = {}) {
  // alias -> influencer (с контакт за мейл)
  const { data: links } = await supabaseAdmin
    .from('utm_links')
    .select('alias, influencer:influencers(id, name, email, promo_code, commission, email_notifications)')
    .eq('campaign_id', campaign.id)

  const aliasToInf = {}
  for (const l of links || []) {
    if (l.alias && l.influencer) aliasToInf[l.alias.toLowerCase()] = l.influencer
  }

  // since — фиксиран прозорец (последните 2 дни), но не по-рано от старта на
  // кампанията. Real-time се поема от webhook-а; cron-ът само подсигурява
  // поръчки, чийто UTM не е бил готов навреме, затова кратък прозорец стига.
  let since = sinceOverride
  if (!since) {
    const lookback = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    since = (campaign.starts_at && campaign.starts_at > lookback) ? campaign.starts_at : lookback
  }

  const shopifyOrders = await fetchOrdersByPromoCode(campaign.promo_code, since)

  const rows = []
  const infById = {}      // id -> influencer (за мейл)
  let unattributed = 0
  for (const o of shopifyOrders) {
    // Основен източник: Customer Journey (utm_content). Резерв: landing URL.
    let alias = await fetchOrderUtmContent(o.shopify_order_id)
    if (!alias) alias = extractCampaignAlias(o.landing_site)
    const inf = alias ? aliasToInf[alias] : null
    if (!inf) { unattributed++; continue }
    infById[inf.id] = inf
    rows.push({
      influencer_id:          inf.id,
      campaign_id:            campaign.id,
      commission_pct:         Number(campaign.commission_pct),
      utm_alias:              alias,
      shopify_order_id:       o.shopify_order_id,
      order_number:           o.order_number,
      created_at_shopify:     o.created_at_shopify,
      total_price:            o.total_price,
      currency:               o.currency,
      financial_status:       o.financial_status,
      fulfillment_status:     o.fulfillment_status,
      line_items:             o.line_items,
      commissionable_revenue: o.commissionable_revenue,
      total_savings:          o.total_savings,
      shipping_total:         o.shipping_total,
      customer_name:          o.customer_name,
      customer_email:         o.customer_email,
      customer_phone:         o.customer_phone,
      shipping_city:          o.shipping_city,
      synced_at:              new Date().toISOString(),
    })
  }

  // Кои са НОВИ (за да пратим мейл само веднъж)
  const orderIds = rows.map(r => r.shopify_order_id)
  const existingIds = new Set()
  if (orderIds.length) {
    const { data: existing } = await supabaseAdmin
      .from('orders').select('shopify_order_id').in('shopify_order_id', orderIds)
    for (const e of existing || []) existingIds.add(String(e.shopify_order_id))
  }
  const newByInf = {}
  for (const r of rows) {
    if (!existingIds.has(String(r.shopify_order_id))) {
      newByInf[r.influencer_id] = (newByInf[r.influencer_id] || 0) + 1
    }
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('orders').upsert(rows, { onConflict: 'shopify_order_id', ignoreDuplicates: false })
    if (error) throw error
  }

  // Мейл за новите поръчки
  let emailed = 0
  for (const [infId, count] of Object.entries(newByInf)) {
    const inf = infById[infId]
    if (inf?.email && inf.email_notifications !== false) {
      try {
        await sendNewOrderNotification({
          to:         inf.email,
          name:       inf.name,
          promoCode:  campaign.promo_code,
          newOrders:  count,
          commission: campaign.commission_pct,
        })
        emailed++
      } catch (err) {
        console.error(`Campaign email error for ${inf.name}:`, err.message)
      }
    }
  }

  return {
    fetched:      shopifyOrders.length,
    attributed:   rows.length,
    unattributed,
    newOrders:    Object.values(newByInf).reduce((s, n) => s + n, 0),
    emailed,
  }
}

// Синк на всички активни кампании (за cron).
export async function syncAllActiveCampaigns() {
  const { data: campaigns } = await supabaseAdmin.from('campaigns').select('*').eq('active', true)
  const results = []
  for (const c of campaigns || []) {
    try {
      results.push({ campaign: c.name, ...(await syncCampaign(c)) })
    } catch (err) {
      results.push({ campaign: c.name, error: err.message })
    }
  }
  return results
}
