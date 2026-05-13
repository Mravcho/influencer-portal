import { supabaseAdmin } from './supabase'
import { fetchOrdersByPromoCode } from './shopify'
import { sendNewOrderNotification } from './email'

const DEFAULT_START = '2026-01-01T00:00:00.000Z'

// Синхронизира поръчките на конкретен инфлуенсър от Shopify.
// Връща обект с резултата.
export async function syncInfluencer(influencer, { fullResync = false, sinceOverride = null } = {}) {
  try {
    // 1. При пълен ре-синк изтриваме всички стари поръчки
    if (fullResync) {
      await supabaseAdmin.from('orders').delete().eq('influencer_id', influencer.id)
    }

    // 2. Вземаме ID-та на вече записаните поръчки (за засичане на нови)
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('shopify_order_id')
      .eq('influencer_id', influencer.id)

    const existingIds = new Set((existing || []).map(r => String(r.shopify_order_id)))

    // 3. Определяме from-дата за Shopify fetch
    let since = sinceOverride || DEFAULT_START
    if (!fullResync && !sinceOverride) {
      const { data: latest } = await supabaseAdmin
        .from('orders')
        .select('created_at_shopify')
        .eq('influencer_id', influencer.id)
        .order('created_at_shopify', { ascending: false })
        .limit(1)
        .single()
      since = latest?.created_at_shopify || DEFAULT_START
    }

    const shopifyOrders = await fetchOrdersByPromoCode(influencer.promo_code, since)

    if (shopifyOrders.length === 0) {
      return { influencer: influencer.name, synced: 0, emailed: false }
    }

    // 4. Засичаме новите
    const newOrders = shopifyOrders.filter(o => !existingIds.has(String(o.shopify_order_id)))

    // 5. Upsert
    const rows = shopifyOrders.map(o => ({
      influencer_id:          influencer.id,
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
      synced_at:              new Date().toISOString(),
    }))

    const { error: upsertError } = await supabaseAdmin
      .from('orders')
      .upsert(rows, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

    if (upsertError) throw upsertError

    // 6. Мейл само ако има нови поръчки и инфлуенсърът има мейл с включени нотификации
    let emailed = false
    if (newOrders.length > 0 && influencer.email && influencer.email_notifications !== false) {
      try {
        await sendNewOrderNotification({
          to:         influencer.email,
          name:       influencer.name,
          promoCode:  influencer.promo_code,
          newOrders:  newOrders.length,
          commission: influencer.commission,
        })
        emailed = true
      } catch (emailErr) {
        console.error(`Email error for ${influencer.name}:`, emailErr.message)
      }
    }

    return {
      influencer: influencer.name,
      synced:     rows.length,
      newOrders:  newOrders.length,
      emailed,
    }
  } catch (err) {
    console.error(`Sync failed for ${influencer.name}:`, err)
    return { influencer: influencer.name, error: err.message }
  }
}
