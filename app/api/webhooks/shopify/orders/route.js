import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { sendNewOrderNotification } from '@/lib/email'

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

function sanitizeWebhookOrder(order, promoCode) {
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
  const discountCodes = (order.discount_codes || []).map(dc => dc.code?.toUpperCase())
  if (discountCodes.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no discount codes' })
  }

  // Намираме активен инфлуенсър с matching промо код
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
    const sanitized = sanitizeWebhookOrder(order, influencer.promo_code)

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
