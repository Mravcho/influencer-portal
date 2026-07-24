import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewOrderNotification } from '@/lib/email'
import { fetchProductImages } from '@/lib/shopify'
import { findActiveCampaignByCodes, resolveCampaignInfluencer } from '@/lib/campaign-sync'

// Verifies Shopify HMAC-SHA256 signature
async function verifyShopifyWebhook(request) {
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  if (!hmacHeader) return false

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret) return false

  const body = await request.text()
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
}

function sanitizeWebhookOrder(order, promoCode, productImages = {}) {
  const shippingTotal = (order.shipping_lines || []).reduce(
    (s, line) => s + parseFloat(line.price || 0), 0
  )

  const codeEntry = (order.discount_codes || []).find(
    dc => dc.code?.toUpperCase() === promoCode.toUpperCase()
  )
  const savingsFromCode = parseFloat(codeEntry?.amount || 0)

  const promoAppIndex = (order.discount_applications || []).findIndex(
    app => app.code?.toUpperCase() === promoCode.toUpperCase()
  )

  let commissionableRevenue = 0
  let totalSavings = 0
  let anyDiscounted = false

  let lineItems = (order.line_items || []).map(item => {
    const fullPrice = parseFloat(item.price) * item.quantity
    let discountAmount = 0
    let isDiscounted = false

    if (promoAppIndex >= 0) {
      const alloc = (item.discount_allocations || []).find(
        a => a.discount_application_index === promoAppIndex
      )
      discountAmount = alloc ? parseFloat(alloc.amount) : 0
      isDiscounted = discountAmount > 0
    }

    if (isDiscounted) {
      anyDiscounted = true
      commissionableRevenue += fullPrice
      totalSavings += discountAmount
    }

    return {
      title: item.title,
      variant: item.variant_title,
      quantity: item.quantity,
      price: parseFloat(item.price),
      discount_amount: Math.round(discountAmount * 100) / 100,
      discounted: isDiscounted,
      sku: item.sku,
      image_url: productImages[item.product_id] || null,
    }
  })

  if (!anyDiscounted) {
    commissionableRevenue = 0
    lineItems = lineItems.map(item => {
      commissionableRevenue += item.price * item.quantity
      return { ...item, discounted: true }
    })
    totalSavings = savingsFromCode
  }

  // Customer info (за admin feed)
  const shippingAddr = order.shipping_address || order.billing_address || {}
  const customerName = [
    shippingAddr.first_name || order.customer?.first_name,
    shippingAddr.last_name  || order.customer?.last_name,
  ].filter(Boolean).join(' ').trim() || null

  return {
    shopify_order_id: order.id,
    order_number: `#${order.order_number}`,
    created_at_shopify: order.created_at,
    total_price: parseFloat(order.total_price),
    currency: order.currency,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    line_items: lineItems,
    total_savings: Math.round(totalSavings * 100) / 100,
    commissionable_revenue: Math.round(commissionableRevenue * 100) / 100,
    shipping_total: Math.round(shippingTotal * 100) / 100,
    customer_name:   customerName,
    customer_email:  order.email || order.contact_email || order.customer?.email || null,
    customer_phone:  shippingAddr.phone || order.phone || order.customer?.phone || null,
    shipping_city:   shippingAddr.city || null,
  }
}

export async function POST(request) {
  // Shopify изисква 200 бързо – клонираме request за четене на body два пъти
  const cloned = request.clone()

  const isValid = await verifyShopifyWebhook(request)
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let order
  try {
    order = await cloned.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Проверяваме дали поръчката има промо код
  const discountCodes = (order.discount_codes || []).map(dc => dc.code?.toUpperCase()).filter(Boolean)
  if (discountCodes.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no discount codes' })
  }

  // Тегли снимките на продуктите от тази поръчка (един път, преди loop-а)
  const productIds = (order.line_items || []).map(li => li.product_id)
  const productImages = await fetchProductImages(productIds)

  // --- КАМПАНИЯ: споделен код + UTM атрибуция (Customer Journey) ---
  const campaign = await findActiveCampaignByCodes(discountCodes)
  if (campaign) {
    const resolved = await resolveCampaignInfluencer(campaign, order.id, order.landing_site)
    if (!resolved) {
      // UTM още не е готов в Shopify — cron-ът ще я хване по-късно
      return NextResponse.json({ ok: true, skipped: 'campaign order, UTM not resolved yet' })
    }
    const { influencer, alias } = resolved
    const s = sanitizeWebhookOrder(order, campaign.promo_code, productImages)

    const { data: existing } = await supabaseAdmin
      .from('orders').select('id').eq('shopify_order_id', s.shopify_order_id).maybeSingle()
    const isNewOrder = !existing

    const { error: upErr } = await supabaseAdmin.from('orders').upsert({
      influencer_id:          influencer.id,
      campaign_id:            campaign.id,
      commission_pct:         Number(campaign.commission_pct),
      utm_alias:              alias,
      shopify_order_id:       s.shopify_order_id,
      order_number:           s.order_number,
      created_at_shopify:     s.created_at_shopify,
      total_price:            s.total_price,
      currency:               s.currency,
      financial_status:       s.financial_status,
      fulfillment_status:     s.fulfillment_status,
      line_items:             s.line_items,
      commissionable_revenue: s.commissionable_revenue,
      total_savings:          s.total_savings,
      shipping_total:         s.shipping_total,
      customer_name:          s.customer_name,
      customer_email:         s.customer_email,
      customer_phone:         s.customer_phone,
      shipping_city:          s.shipping_city,
      synced_at:              new Date().toISOString(),
    }, { onConflict: 'shopify_order_id', ignoreDuplicates: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    let emailed = false
    if (isNewOrder && influencer.email && influencer.email_notifications !== false) {
      try {
        await sendNewOrderNotification({
          to: influencer.email, name: influencer.name,
          promoCode: campaign.promo_code, newOrders: 1, commission: campaign.commission_pct,
        })
        emailed = true
      } catch (e) { console.error('Campaign webhook email error:', e.message) }
    }
    return NextResponse.json({ ok: true, campaign: campaign.name, influencer: influencer.name, action: isNewOrder ? 'created' : 'updated', emailed })
  }

  // Намираме активен инфлуенсър с matching промо код (нормален поток)
  const { data: influencers } = await supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, commission, email, email_notifications')
    .eq('active', true)
    .in('promo_code', discountCodes)

  if (!influencers || influencers.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no matching influencer' })
  }

  const results = []

  for (const influencer of influencers) {
    const sanitized = sanitizeWebhookOrder(order, influencer.promo_code, productImages)

    // Проверка дали поръчката вече съществува – ако да, ще е update (без имейл)
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('shopify_order_id', sanitized.shopify_order_id)
      .maybeSingle()

    const isNewOrder = !existing

    const row = {
      influencer_id: influencer.id,
      shopify_order_id: sanitized.shopify_order_id,
      order_number: sanitized.order_number,
      created_at_shopify: sanitized.created_at_shopify,
      total_price: sanitized.total_price,
      currency: sanitized.currency,
      financial_status: sanitized.financial_status,
      fulfillment_status: sanitized.fulfillment_status,
      line_items: sanitized.line_items,
      commissionable_revenue: sanitized.commissionable_revenue,
      total_savings: sanitized.total_savings,
      shipping_total: sanitized.shipping_total,
      customer_name:  sanitized.customer_name,
      customer_email: sanitized.customer_email,
      customer_phone: sanitized.customer_phone,
      shipping_city:  sanitized.shipping_city,
      synced_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabaseAdmin
      .from('orders')
      .upsert(row, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

    if (upsertError) {
      console.error(`Webhook upsert error for ${influencer.name}:`, upsertError.message)
      results.push({ influencer: influencer.name, error: upsertError.message })
      continue
    }

    // Имейл само при НОВА поръчка – не при update на статус
    let emailed = false
    if (isNewOrder && influencer.email && influencer.email_notifications !== false) {
      try {
        await sendNewOrderNotification({
          to: influencer.email,
          name: influencer.name,
          promoCode: influencer.promo_code,
          newOrders: 1,
          commission: influencer.commission,
        })
        emailed = true
      } catch (emailErr) {
        console.error(`Webhook email error for ${influencer.name}:`, emailErr.message)
      }
    }

    results.push({
      influencer: influencer.name,
      saved: true,
      action: isNewOrder ? 'created' : 'updated',
      emailed,
    })
  }

  return NextResponse.json({ ok: true, results })
}
