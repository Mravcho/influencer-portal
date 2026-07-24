import { supabaseAdmin } from './supabase'
import { fetchOrdersByPromoCode, fetchOrderUtmContent } from './shopify'
import { extractCampaignAlias } from './share-links'

const DEFAULT_START = '2026-01-01T00:00:00.000Z'

// Синхронизира поръчките на КАМПАНИЯ: дърпа всички поръчки със споделения код,
// после приписва всяка на инфлуенсър по UTM alias (utm_content от landing_site).
// Пише в orders паралелно на нормалните — с campaign_id + commission_pct + utm_alias.
export async function syncCampaign(campaign, { sinceOverride = null } = {}) {
  // 1) alias -> influencer_id (само линковете на тази кампания)
  const { data: links } = await supabaseAdmin
    .from('utm_links')
    .select('alias, influencer_id')
    .eq('campaign_id', campaign.id)

  const aliasToInfluencer = {}
  for (const l of links || []) {
    if (l.alias && l.influencer_id) aliasToInfluencer[l.alias.toLowerCase()] = l.influencer_id
  }

  // 2) since — последната синкната кампанийна поръчка, иначе старт на кампанията
  let since = sinceOverride
  if (!since) {
    const { data: latest } = await supabaseAdmin
      .from('orders')
      .select('created_at_shopify')
      .eq('campaign_id', campaign.id)
      .order('created_at_shopify', { ascending: false })
      .limit(1)
      .maybeSingle()
    since = latest?.created_at_shopify || campaign.starts_at || DEFAULT_START
  }

  // 3) Всички поръчки със споделения код
  const shopifyOrders = await fetchOrdersByPromoCode(campaign.promo_code, since)

  // 4) Приписване по alias
  const rows = []
  const unattributedOrders = []
  const perInfluencer = {}
  for (const o of shopifyOrders) {
    // Основен източник: Customer Journey (utm_content). Резерв: landing URL.
    let alias = await fetchOrderUtmContent(o.shopify_order_id)
    if (!alias) alias = extractCampaignAlias(o.landing_site)
    const influencerId = alias ? aliasToInfluencer[alias] : null
    if (!influencerId) {
      unattributedOrders.push({ order_number: o.order_number, landing_site: o.landing_site || null })
      continue
    }
    perInfluencer[influencerId] = (perInfluencer[influencerId] || 0) + 1
    rows.push({
      influencer_id:          influencerId,
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

  // 5) Upsert (по shopify_order_id — не дублира)
  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('orders')
      .upsert(rows, { onConflict: 'shopify_order_id', ignoreDuplicates: false })
    if (error) throw error
  }

  return {
    fetched:       shopifyOrders.length,
    attributed:    rows.length,
    unattributed:  unattributedOrders.length,
    unattributedOrders,
    perInfluencer,
  }
}
