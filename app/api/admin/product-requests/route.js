import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createDraftOrder } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET → списък със заявки (по подразбиране pending + sent_to_shopify)
// ?count=pending → връща само { count } за badge
// ?status=all → връща всичко
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const count  = searchParams.get('count')
  const status = searchParams.get('status') // 'all' | undefined

  if (count === 'pending') {
    const { count: c } = await supabaseAdmin
      .from('product_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return NextResponse.json({ count: c || 0 })
  }

  let query = supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,
      shopify_draft_order_id, status, requested_at, fulfilled_at, notes,
      influencer:influencers(id, name, username, promo_code, email),
      product:request_products(id, name, image_url, shopify_product_id, shopify_variant_id, price, paid_discount_pct)
    `)
    .order('requested_at', { ascending: false })

  if (status !== 'all') {
    query = query.in('status', ['pending', 'sent_to_shopify'])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// PATCH { id, action: 'approve' | 'cancel' | 'fulfilled' [, notes] }
// approve → създава Shopify Draft Order и записва ID + статус = sent_to_shopify
// cancel  → status = cancelled (освобождава cooldown-а, ако трябва)
// fulfilled → status = fulfilled, fulfilled_at = now
export async function PATCH(request) {
  const { id, action, notes } = await request.json()
  if (!id || !action) return NextResponse.json({ error: 'Липсват полета' }, { status: 400 })

  // Зареждаме заявката с product + influencer info
  const { data: req, error: reqErr } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total, status,
      shopify_draft_order_id,
      influencer:influencers(id, name, email, promo_code),
      product:request_products(id, name, shopify_product_id, shopify_variant_id, price, paid_discount_pct)
    `)
    .eq('id', id)
    .single()

  if (reqErr || !req) {
    return NextResponse.json({ error: 'Заявката не съществува' }, { status: 404 })
  }

  if (action === 'cancel') {
    const { data, error } = await supabaseAdmin
      .from('product_requests')
      .update({ status: 'cancelled', notes: notes || null })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'fulfilled') {
    const { data, error } = await supabaseAdmin
      .from('product_requests')
      .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'approve') {
    if (req.status !== 'pending') {
      return NextResponse.json({ error: 'Заявката не е в статус pending' }, { status: 400 })
    }
    if (!req.product?.shopify_variant_id) {
      return NextResponse.json({
        error: 'Продуктът няма Shopify variant ID — пусни „🔄 Refresh from Shopify" в каталога.',
      }, { status: 400 })
    }

    // Подготвяме line_items: отделни редове за безплатно и за платено,
    // за да може admin-ът да види разбивката в Shopify Admin.
    const lineItems = []
    if (req.free_quantity > 0) {
      lineItems.push({
        variant_id:       Number(req.product.shopify_variant_id),
        quantity:         req.free_quantity,
        applied_discount: {
          value_type:  'percentage',
          value:       '100.0',
          title:       'Influencer free',
          description: `Безплатно за инфлуенсър ${req.influencer.name}`,
        },
      })
    }
    if (req.paid_quantity > 0) {
      lineItems.push({
        variant_id:       Number(req.product.shopify_variant_id),
        quantity:         req.paid_quantity,
        applied_discount: {
          value_type:  'percentage',
          value:       String(req.product.paid_discount_pct),
          title:       `Influencer -${req.product.paid_discount_pct}%`,
          description: `Отстъпка за инфлуенсър ${req.influencer.name}`,
        },
      })
    }

    let draftOrder
    try {
      draftOrder = await createDraftOrder({
        lineItems,
        note: `Заявка от инфлуенсър: ${req.influencer.name} (${req.influencer.promo_code})\n` +
              `Продукт: ${req.product.name}\n` +
              `Безплатно: ${req.free_quantity} бр., платено: ${req.paid_quantity} бр.\n` +
              `Сума за плащане: ${Number(req.paid_total).toFixed(2)} €`,
        customerEmail: req.influencer.email || null,
        tags: ['influencer-request', req.influencer.promo_code],
      })
    } catch (err) {
      return NextResponse.json({
        error: `Shopify Draft Order error: ${err.message}`,
      }, { status: 502 })
    }

    const { data, error } = await supabaseAdmin
      .from('product_requests')
      .update({
        status:                  'sent_to_shopify',
        shopify_draft_order_id:  String(draftOrder?.id || ''),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ...data, draft_order_invoice_url: draftOrder?.invoice_url || null })
  }

  return NextResponse.json({ error: 'Неизвестно действие' }, { status: 400 })
}
