import { supabaseAdmin } from './supabase'
import { fetchOrdersByPromoCode } from './shopify'
import { ordersHaveCancelledAt, fetchAllRows } from './order-status'
import { sendNewOrderNotification } from './email'

const DEFAULT_START = '2026-01-01T00:00:00.000Z'

// Синхронизира поръчките на конкретен инфлуенсър от Shopify.
// Връща обект с резултата.
// Колко дни назад да проверяваме за ПРОМЕНЕНИ поръчки при инкрементален sync.
// Инкременталният fetch тегли само поръчки, създадени след последната записана —
// затова анулиране/рефунд/плащане на по-стара поръчка иначе никога не се
// отразява в портала. Вторият проход по updated_at го хваща.
const DEFAULT_REFRESH_DAYS = 3
// Колко дни назад една нова за базата поръчка се брои за нова и за инфлуенсъра (мейл)
const NOTIFY_WINDOW_DAYS = 7

export async function syncInfluencer(influencer, {
  fullResync = false,
  sinceOverride = null,
  refreshDays = DEFAULT_REFRESH_DAYS,
} = {}) {
  try {
    // 1. При пълен ре-синк изтриваме всички стари поръчки
    if (fullResync) {
      await supabaseAdmin.from('orders').delete().eq('influencer_id', influencer.id)
    }

    // 2. Вземаме ID-та на вече записаните поръчки (за засичане на нови).
    //    Ако заявката се провали, спираме — иначе всичко от Shopify минава за
    //    „ново“ и инфлуенсърът получава мейл за десетки стари поръчки.
    //    fetchAllRows заобикаля лимита от 1000 реда на заявка.
    const existing = await fetchAllRows((from, to) => supabaseAdmin
      .from('orders')
      .select('shopify_order_id')
      .eq('influencer_id', influencer.id)
      .range(from, to))

    const existingIds = new Set(existing.map(r => String(r.shopify_order_id)))

    // 3. Определяме from-дата за Shopify fetch
    let since = sinceOverride || DEFAULT_START
    if (!fullResync && !sinceOverride) {
      const { data: latest, error: latestErr } = await supabaseAdmin
        .from('orders')
        .select('created_at_shopify')
        .eq('influencer_id', influencer.id)
        .order('created_at_shopify', { ascending: false })
        .limit(1)
        .maybeSingle()
      // Грешка ≠ „няма поръчки“: при грешка не падаме до DEFAULT_START, защото
      // това тегли цялата история наново и я обявява за нова.
      if (latestErr) throw new Error(`latest order lookup failed: ${latestErr.message}`)
      since = latest?.created_at_shopify || DEFAULT_START
    }

    const createdSince = await fetchOrdersByPromoCode(influencer.promo_code, since)

    // 3b. Втори проход: поръчки, ПРОМЕНЕНИ в последните refreshDays дни.
    //     Хваща анулирани/рефунднати/платени стари поръчки, които първият
    //     проход (филтър по created_at) пропуска. При fullResync не е нужен.
    let updatedRecently = []
    if (!fullResync && refreshDays > 0) {
      const refreshFrom = new Date(Date.now() - refreshDays * 86400000).toISOString()
      updatedRecently = await fetchOrdersByPromoCode(influencer.promo_code, refreshFrom, 'updated_at')
    }

    // Обединяваме двата резултата по shopify_order_id (без дублирани редове)
    const byId = new Map()
    for (const o of [...createdSince, ...updatedRecently]) {
      byId.set(String(o.shopify_order_id), o)
    }
    const shopifyOrders = [...byId.values()]

    if (shopifyOrders.length === 0) {
      return { influencer: influencer.name, synced: 0, emailed: false }
    }

    // 4. Засичаме новите
    const newOrders = shopifyOrders.filter(o => !existingIds.has(String(o.shopify_order_id)))

    // 5. Upsert
    const withCancelled = await ordersHaveCancelledAt()
    const rows = shopifyOrders.map(o => ({
      ...(withCancelled ? { cancelled_at: o.cancelled_at || null } : {}),
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
      customer_name:          o.customer_name,
      customer_email:         o.customer_email,
      customer_phone:         o.customer_phone,
      shipping_city:          o.shipping_city,
      synced_at:              new Date().toISOString(),
    }))

    const { error: upsertError } = await supabaseAdmin
      .from('orders')
      .upsert(rows, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

    if (upsertError) throw upsertError

    // 6. Мейл само за наистина нови поръчки — създадени през последните дни.
    //    Backfill на историята (нов инфлуенсър, пълен ре-синк, повторно теглене
    //    след срив на заявка) не е повод за „Имаш 66 нови поръчки“.
    const recentCutoff = Date.now() - NOTIFY_WINDOW_DAYS * 86400000
    const notifyOrders = (fullResync || sinceOverride)
      ? []
      : newOrders.filter(o => new Date(o.created_at_shopify).getTime() >= recentCutoff)
    let emailed = false
    if (notifyOrders.length > 0 && influencer.email && influencer.email_notifications !== false) {
      try {
        await sendNewOrderNotification({
          to:         influencer.email,
          name:       influencer.name,
          promoCode:  influencer.promo_code,
          newOrders:  notifyOrders.length,
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
