import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createOrder, fetchVariantComponents } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

const METHOD_LABELS = {
  econt_office:  'Еконт офис',
  speedy_office: 'Спиди офис',
  boxnow:        'BoxNow',
  address:       'Адрес',
}

// Построява shipping_address + customer name за Shopify от данните на заявката.
// Shopify изисква city за BG поръчки; ако не я подадем — цялото address се
// отхвърля. Опитваме да я извлечем от shipping_location ("София, офис 87" →
// "София") или fallback-ваме на "София".
function buildShipping(req, influencerName) {
  const methodLabel = METHOD_LABELS[req.shipping_method] || req.shipping_method || '—'
  const nameParts = (req.shipping_recipient || '').trim().split(/\s+/)
  const firstName = nameParts[0] || influencerName?.split(/\s+/)[0] || 'Получател'
  const lastName  = nameParts.slice(1).join(' ') || '—'
  const cityGuess = req.shipping_method === 'address'
    ? 'София'
    : ((req.shipping_location || '').split(/[,;–-]/)[0].trim() || 'София')
  const shippingAddress = {
    first_name:   firstName,
    last_name:    lastName,
    phone:        req.shipping_phone || '',
    address1:     req.shipping_method === 'address'
                    ? (req.shipping_location || '')
                    : `${methodLabel}: ${req.shipping_location || ''}`,
    city:         cityGuess,
    zip:          '0000',
    country:      'Bulgaria',
    country_code: 'BG',
  }
  return { methodLabel, firstName, lastName, shippingAddress }
}

// Построява Shopify line items за дадена бройка от продукт.
// Ако вариантът е bundle (Shopify Bundles), го разгъва на компонентните варианти —
// Shopify не приема bundle вариант директно в поръчка. Цялата цена/бр. на пакета
// сяда на първия компонент, останалите са 0, така че сумата остава вярна.
async function buildProductLineItems({ variantId, quantity, unitPrice, baseTitle, suffix }) {
  if (!quantity || quantity <= 0) return []
  const components = await fetchVariantComponents(variantId)

  if (!components) {
    return [{
      variant_id: Number(variantId),
      quantity,
      price:      unitPrice.toFixed(2),
      title:      `${baseTitle} ${suffix}`.trim(),
    }]
  }

  return components.map((c, idx) => ({
    variant_id: Number(c.variantId),
    quantity:   c.quantity * quantity,
    price:      (idx === 0 ? unitPrice / c.quantity : 0).toFixed(2),
    title:      `${baseTitle} → ${c.title} ${suffix}`.trim(),
  }))
}

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
      shipping_method, shipping_recipient, shipping_phone, shipping_location,
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
      shipping_method, shipping_recipient, shipping_phone, shipping_location,
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

    // Подготвяме line_items с директни override-нати цени.
    // На реални Orders applied_discount НЕ работи (само на Draft Orders).
    // Затова override-ваме price на всеки ред — 0 за безплатните, дисконтирана цена за платените.
    const unitPrice = Number(req.product.price || 0)
    const unitPaid  = unitPrice * (1 - Number(req.product.paid_discount_pct || 0) / 100)

    let shopifyOrder
    try {
      const lineItems = [
        ...await buildProductLineItems({
          variantId: req.product.shopify_variant_id,
          quantity:  req.free_quantity,
          unitPrice: 0,
          baseTitle: req.product.name,
          suffix:    '(безплатно — инфлуенсър)',
        }),
        ...await buildProductLineItems({
          variantId: req.product.shopify_variant_id,
          quantity:  req.paid_quantity,
          unitPrice: unitPaid,
          baseTitle: req.product.name,
          suffix:    `(-${req.product.paid_discount_pct}% инфлуенсър)`,
        }),
      ]

      const { methodLabel, firstName, lastName, shippingAddress } = buildShipping(req, req.influencer.name)

      const noteLines = [
        `Заявка от инфлуенсър: ${req.influencer.name} (${req.influencer.promo_code})`,
        `Продукт: ${req.product.name}`,
        `Безплатно: ${req.free_quantity} бр., платено: ${req.paid_quantity} бр.`,
        `Сума за плащане: ${Number(req.paid_total).toFixed(2)} €`,
        '',
        '— ДОСТАВКА —',
        `Начин: ${methodLabel}`,
        `Получател: ${req.shipping_recipient || '—'}`,
        `Телефон: ${req.shipping_phone || '—'}`,
        `${req.shipping_method === 'address' ? 'Адрес' : 'Офис'}: ${req.shipping_location || '—'}`,
      ]

      // Explicit customer block — само име на получателя.
      // НЕ подаваме email НИТО phone, защото Shopify ги ползва за customer matching
      // и хвърля 422 ако вече съществува customer record с тях. Phone остава в
      // shipping_address за куриера.
      const customer = {
        first_name: firstName,
        last_name:  lastName,
      }

      shopifyOrder = await createOrder({
        lineItems,
        note: noteLines.join('\n'),
        customer,
        tags: [
          'influencer-request',
          req.influencer.promo_code,
          `shipping-${req.shipping_method || 'unknown'}`,
        ].filter(Boolean),
        shippingAddress,
      })
    } catch (err) {
      return NextResponse.json({
        error: `Shopify Order error: ${err.message}`,
      }, { status: 502 })
    }

    const { data, error } = await supabaseAdmin
      .from('product_requests')
      .update({
        status:                  'sent_to_shopify',
        shopify_draft_order_id:  String(shopifyOrder?.id || ''),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ...data,
      shopify_order_number: shopifyOrder?.order_number ? `#${shopifyOrder.order_number}` : null,
    })
  }

  return NextResponse.json({ error: 'Неизвестно действие' }, { status: 400 })
}

// POST → обединява няколко pending заявки от СЪЩИЯ инфлуенсър в ЕДНА Shopify
// поръчка (една доставка). Позволява override на цената на платените редове —
// напр. да направиш допълнителен продукт безплатен за конкретен инфлуенсър.
//
// body: {
//   ids:            [uuid, ...]                       // >= 2 заявки
//   shippingFromId: uuid                              // от коя заявка да е доставката (по подразб. първата)
//   overrides:      { [requestId]: { paidUnitPrice } } // нова цена/бр. за платените бройки (0 = безплатно)
// }
export async function POST(request) {
  const body = await request.json()
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter(Boolean))] : []
  const overrides = body.overrides || {}

  if (ids.length < 2) {
    return NextResponse.json({ error: 'Избери поне 2 заявки за обединяване' }, { status: 400 })
  }

  const { data: reqs, error: reqErr } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total, status,
      shipping_method, shipping_recipient, shipping_phone, shipping_location,
      influencer:influencers(id, name, email, promo_code),
      product:request_products(id, name, shopify_product_id, shopify_variant_id, price, paid_discount_pct)
    `)
    .in('id', ids)

  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
  if (!reqs || reqs.length !== ids.length) {
    return NextResponse.json({ error: 'Някоя от заявките не съществува' }, { status: 404 })
  }

  // Валидации
  if (reqs.some(r => r.status !== 'pending')) {
    return NextResponse.json({ error: 'Всички заявки трябва да са в статус „Чакаща".' }, { status: 400 })
  }
  if (new Set(reqs.map(r => r.influencer?.id)).size !== 1) {
    return NextResponse.json({ error: 'Заявките трябва да са от един и същ инфлуенсър.' }, { status: 400 })
  }
  const missingVariant = reqs.find(r => !r.product?.shopify_variant_id)
  if (missingVariant) {
    return NextResponse.json({
      error: `Продукт „${missingVariant.product?.name}" няма Shopify variant ID — пусни „🔄 Refresh from Shopify" в каталога.`,
    }, { status: 400 })
  }

  const influencer = reqs[0].influencer

  // Построяваме обединените line_items + смятаме новата paid_total за всяка заявка
  const lineItems = []
  const updatedTotals = {} // requestId → нова paid_total
  let combinedPaid = 0
  const productLines = []  // за бележката
  for (const r of reqs) {
    const unitPrice   = Number(r.product.price || 0)
    const defaultPaid = unitPrice * (1 - Number(r.product.paid_discount_pct || 0) / 100)
    const ov = overrides[r.id] || {}
    const paidUnit = ov.paidUnitPrice != null && ov.paidUnitPrice !== ''
      ? Math.max(0, Number(ov.paidUnitPrice))
      : defaultPaid

    const isFree = paidUnit <= 0
    try {
      lineItems.push(...await buildProductLineItems({
        variantId: r.product.shopify_variant_id,
        quantity:  r.free_quantity,
        unitPrice: 0,
        baseTitle: r.product.name,
        suffix:    '(безплатно — инфлуенсър)',
      }))
      lineItems.push(...await buildProductLineItems({
        variantId: r.product.shopify_variant_id,
        quantity:  r.paid_quantity,
        unitPrice: paidUnit,
        baseTitle: r.product.name,
        suffix:    isFree
          ? '(безплатно — инфлуенсър)'
          : `(-${r.product.paid_discount_pct}% инфлуенсър)`,
      }))
    } catch (err) {
      return NextResponse.json({ error: `Shopify Order error: ${err.message}` }, { status: 502 })
    }
    const reqPaidTotal = paidUnit * r.paid_quantity
    updatedTotals[r.id] = Number(reqPaidTotal.toFixed(2))
    combinedPaid += reqPaidTotal
    productLines.push(
      `- ${r.product.name}: безплатно ${r.free_quantity} бр., платено ${r.paid_quantity} бр. (${reqPaidTotal.toFixed(2)} €)`
    )
  }

  // Доставка — от избраната заявка (по подразбиране първата от списъка)
  const shipReq = reqs.find(r => r.id === body.shippingFromId) || reqs[0]
  const { methodLabel, firstName, lastName, shippingAddress } = buildShipping(shipReq, influencer.name)

  let shopifyOrder
  try {
    const noteLines = [
      `Обединена заявка от инфлуенсър: ${influencer.name} (${influencer.promo_code})`,
      `Брой обединени заявки: ${reqs.length}`,
      'Продукти:',
      ...productLines,
      `Обща сума за плащане: ${combinedPaid.toFixed(2)} €`,
      '',
      '— ДОСТАВКА —',
      `Начин: ${methodLabel}`,
      `Получател: ${shipReq.shipping_recipient || '—'}`,
      `Телефон: ${shipReq.shipping_phone || '—'}`,
      `${shipReq.shipping_method === 'address' ? 'Адрес' : 'Офис'}: ${shipReq.shipping_location || '—'}`,
    ]

    shopifyOrder = await createOrder({
      lineItems,
      note: noteLines.join('\n'),
      customer: { first_name: firstName, last_name: lastName },
      tags: [
        'influencer-request',
        'merged',
        influencer.promo_code,
        `shipping-${shipReq.shipping_method || 'unknown'}`,
      ].filter(Boolean),
      shippingAddress,
    })
  } catch (err) {
    return NextResponse.json({ error: `Shopify Order error: ${err.message}` }, { status: 502 })
  }

  // Всички обединени заявки сочат към една и съща Shopify поръчка
  const orderId = String(shopifyOrder?.id || '')
  const results = await Promise.all(reqs.map(r =>
    supabaseAdmin
      .from('product_requests')
      .update({
        status:                 'sent_to_shopify',
        shopify_draft_order_id: orderId,
        paid_total:             updatedTotals[r.id],
      })
      .eq('id', r.id)
  ))
  const updateErr = results.find(res => res.error)
  if (updateErr) return NextResponse.json({ error: updateErr.error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    merged: reqs.length,
    shopify_order_number: shopifyOrder?.order_number ? `#${shopifyOrder.order_number}` : null,
  })
}
