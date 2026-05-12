import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchOrdersByPromoCode } from '@/lib/shopify'
import { sendNewOrderNotification } from '@/lib/email'

// POST /api/admin/sync          → sync всички инфлуенсъри
// POST /api/admin/sync?id=uuid  → sync само един
export async function POST(request) {
  // Проверка: или Vercel Cron, или логнат admin
  const authHeader = request.headers.get('authorization')
  const userRole   = request.headers.get('x-user-role')
  const isCron     = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdmin    = userRole === 'admin'
  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const singleId = searchParams.get('id')

  // Вземаме email и email_notifications заедно с останалите полета
  let query = supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, commission, email, email_notifications')
    .eq('active', true)
  if (singleId) query = query.eq('id', singleId)

  const { data: influencers, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []

  for (const influencer of influencers) {
    try {
      // 1. Вземаме всички вече записани shopify_order_id за този инфлуенсър
      //    Това ни позволява точно да засечем кои са НОВИ след upsert-а
      const { data: existing } = await supabaseAdmin
        .from('orders')
        .select('shopify_order_id')
        .eq('influencer_id', influencer.id)

      const existingIds = new Set((existing || []).map(r => String(r.shopify_order_id)))

      // 2. Инкрементален fetch от Shopify – само след последната поръчка
      const { data: latest } = await supabaseAdmin
        .from('orders')
        .select('created_at_shopify')
        .eq('influencer_id', influencer.id)
        .order('created_at_shopify', { ascending: false })
        .limit(1)
        .single()

      const since = latest?.created_at_shopify || null
      const shopifyOrders = await fetchOrdersByPromoCode(influencer.promo_code, since)

      if (shopifyOrders.length === 0) {
        results.push({ influencer: influencer.name, synced: 0, emailed: false })
        continue
      }

      // 3. Засичаме кои са наистина НОВИ (не са в базата)
      const newOrders = shopifyOrders.filter(
        o => !existingIds.has(String(o.shopify_order_id))
      )

      // 4. Upsert – записваме всичко (нови + обновени статуси)
      const rows = shopifyOrders.map(o => ({
        influencer_id:      influencer.id,
        shopify_order_id:   o.shopify_order_id,
        order_number:       o.order_number,
        created_at_shopify: o.created_at_shopify,
        total_price:        o.total_price,
        currency:           o.currency,
        financial_status:   o.financial_status,
        fulfillment_status: o.fulfillment_status,
        line_items:         o.line_items,
        synced_at:          new Date().toISOString(),
      }))

      const { error: upsertError } = await supabaseAdmin
        .from('orders')
        .upsert(rows, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

      if (upsertError) throw upsertError

      // 5. Изпращаме мейл само ако:
      //    - има НОВИ поръчки (не само обновени статуси)
      //    - инфлуенсърът има мейл адрес
      //    - email_notifications не е изключен
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
          // Мейл грешката не спира sync-а – логваме само
          console.error(`Email error for ${influencer.name}:`, emailErr.message)
        }
      }

      results.push({
        influencer: influencer.name,
        synced:     rows.length,
        newOrders:  newOrders.length,
        emailed,
      })
    } catch (err) {
      console.error(`Sync failed for ${influencer.name}:`, err)
      results.push({ influencer: influencer.name, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, results, syncedAt: new Date().toISOString() })
}
