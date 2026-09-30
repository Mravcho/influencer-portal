import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { productPaymentSupported, partialPaymentSupported, commissionPart, agreedUnitPrice, agreedDiscountPct } from '@/lib/product-payment'
import { syncRequestDeliveries } from '@/lib/request-deliveries'
import { buildMiddlewareShipping, resolveOffice, resolveCity } from '@/lib/courier-offices'
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
// Адрес за Shopify поръчката във формата на middleware.bg (офис по код от списъка
// на куриера, град и пощенски код на офиса, бележки _mw_shipping/_mw_address).
// Връща { ok, error?, methodLabel, firstName, lastName, shippingAddress, noteAttributes }
async function buildShipping(req, influencerName) {
  const methodLabel = METHOD_LABELS[req.shipping_method] || req.shipping_method || '—'
  const nameParts = (req.shipping_recipient || '').trim().split(/\s+/)
  const firstName = nameParts[0] || influencerName?.split(/\s+/)[0] || 'Получател'
  const lastName  = nameParts.slice(1).join(' ') || '—'

  const mw = await buildMiddlewareShipping(req.shipping_method, req.shipping_location)
  if (!mw.ok) {
    return {
      ok: false,
      error: mw.error === 'city_not_found'
        ? `Не разпознах града в адреса „${req.shipping_location}“. Редактирай адреса (град, пощенски код, улица) и опитай пак.`
        : `Офисът „${req.shipping_location}“ не е избран от списъка на куриера. Избери офиса в заявката и опитай пак.`,
    }
  }
  const shippingAddress = {
    first_name:   firstName,
    last_name:    lastName,
    phone:        req.shipping_phone || '',
    address1:     mw.address1,
    city:         mw.city,
    zip:          mw.zip,
    country:      'Bulgaria',
    country_code: 'BG',
  }
  return { ok: true, methodLabel, firstName, lastName, shippingAddress, noteAttributes: mw.noteAttributes }
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
  const PM = ((await productPaymentSupported()) ? ' payment_method,' : '') + ((await partialPaymentSupported()) ? ' paid_from_commission,' : '')
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

  // Преди да покажем списъка — затваряме доставените (Shopify знае статуса на пратката)
  let shipments = {}
  try {
    shipments = (await syncRequestDeliveries()).shipments || {}
  } catch (err) {
    console.error('Request deliveries sync failed:', err.message)
  }

  let query = supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,${PM}
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
  // Чакащите: разпознат ли е офисът/градът във формата на middleware-а
  const withMw = await Promise.all((data || []).map(async r => {
    if (r.status !== 'pending') return r
    try {
      if (r.shipping_method === 'address') {
        const place = await resolveCity(r.shipping_location)
        return { ...r, mw: place ? { ok: true, city: place.city, zip: place.zip } : { ok: false, error: 'city_not_found' } }
      }
      const o = await resolveOffice(r.shipping_method, r.shipping_location)
      return { ...r, mw: o.ok ? { ok: true, label: o.office.label } : { ok: false, error: 'office_not_selected', suggestion: o.suggestion || null } }
    } catch {
      return r
    }
  }))

  // Изпратените получават статуса на пратката от Shopify (товарителница, в движение, …)
  return NextResponse.json(withMw.map(r =>
    r.status === 'sent_to_shopify' && r.shopify_draft_order_id
      ? { ...r, shipment: shipments[String(r.shopify_draft_order_id)] || null }
      : r
  ))
}

// PATCH { id, action: 'approve' | 'cancel' | 'fulfilled' [, notes] }
// approve → създава Shopify Draft Order и записва ID + статус = sent_to_shopify
// cancel  → status = cancelled (освобождава cooldown-а, ако трябва)
// fulfilled → status = fulfilled, fulfilled_at = now
export async function PATCH(request) {
  const PM = ((await productPaymentSupported()) ? ' payment_method,' : '') + ((await partialPaymentSupported()) ? ' paid_from_commission,' : '')
  const { id, action, notes, location: body_location } = await request.json()
  if (!id || !action) return NextResponse.json({ error: 'Липсват полета' }, { status: 400 })

  // Зареждаме заявката с product + influencer info
  const { data: req, error: reqErr } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,${PM} status,
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

  if (action === 'set_location') {
    if (req.status !== 'pending') {
      return NextResponse.json({ error: 'Може да се променя само чакаща заявка.' }, { status: 400 })
    }
    const location = String(body_location || "").trim()
    if (!location) return NextResponse.json({ error: 'Липсва офис/адрес.' }, { status: 400 })
    const mw = await buildMiddlewareShipping(req.shipping_method, location)
    if (!mw.ok) {
      return NextResponse.json({
        error: mw.error === 'city_not_found' ? 'Не разпознах града в адреса.' : 'Избери офис от списъка.',
      }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin
      .from('product_requests')
      .update({ shipping_location: location })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
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
    // Договорената цена от заявката (включва индивидуалната отстъпка на инфлуенсъра)
    const unitPaid  = agreedUnitPrice(req)
    const pctLabel  = agreedDiscountPct(req)

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
          suffix:    `(-${pctLabel}% инфлуенсър)`,
        }),
      ]

      const ship = await buildShipping(req, req.influencer.name)
      if (!ship.ok) return NextResponse.json({ error: ship.error }, { status: 400 })
      const { methodLabel, firstName, lastName, shippingAddress, noteAttributes } = ship

      const noteLines = [
        `Заявка от инфлуенсър: ${req.influencer.name} (${req.influencer.promo_code})`,
        `Продукт: ${req.product.name}`,
        `Безплатно: ${req.free_quantity} бр., платено: ${req.paid_quantity} бр.`,
        `Сума за плащане: ${Number(req.paid_total).toFixed(2)} €`,
        ...(commissionPart(req) > 0
          ? (commissionPart(req) >= Number(req.paid_total) - 0.005
              ? [`💳 ПЛАТЕНО ОТ КОМИСИОННАТА НА ИНФЛУЕНСЪРА — НЕ СЕ СЪБИРА НАЛОЖЕН ПЛАТЕЖ`]
              : [`💳 От комисионната на инфлуенсъра: ${commissionPart(req).toFixed(2)} €`,
                 `ЗА СЪБИРАНЕ (наложен платеж): ${(Number(req.paid_total) - commissionPart(req)).toFixed(2)} €`])
          : []),
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
          ...(commissionPart(req) > 0 ? ['paid-from-commission'] : []),
          req.influencer.promo_code,
          `shipping-${req.shipping_method || 'unknown'}`,
        ].filter(Boolean),
        shippingAddress,
        noteAttributes,
        payment: { fromCommission: commissionPart(req) },
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

// POST → създава ЕДНА Shopify поръчка от 1+ pending заявки на СЪЩИЯ инфлуенсър
// (една доставка). Позволява:
//  - override на цената на платените редове (0 = безплатно);
//  - добавяне на допълнителни продукти (мърч) по преценка на админа.
//
// body: {
//   ids:            [uuid, ...]                        // >= 1 заявка
//   shippingFromId: uuid                               // от коя заявка да е доставката (по подразб. първата)
//   overrides:      { [requestId]: { paidUnitPrice } } // нова цена/бр. за платените бройки (0 = безплатно)
//   extras:         [{ variantId, quantity, price, name }] // доп. продукти (price по подразб. 0)
// }
export async function POST(request) {
  const PM = ((await productPaymentSupported()) ? ' payment_method,' : '') + ((await partialPaymentSupported()) ? ' paid_from_commission,' : '')
  const body = await request.json()
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter(Boolean))] : []
  const overrides = body.overrides || {}
  const extras = Array.isArray(body.extras) ? body.extras : []

  if (ids.length < 1) {
    return NextResponse.json({ error: 'Избери поне 1 заявка' }, { status: 400 })
  }

  const { data: reqs, error: reqErr } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,${PM} status,
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
    const defaultPaid = agreedUnitPrice(r)
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
          : `(-${agreedDiscountPct(r)}% инфлуенсър)`,
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

  // Допълнителни продукти (мърч) по преценка на админа
  const extraLines = []
  try {
    for (const ex of extras) {
      if (!ex.variantId) continue
      const qty   = Math.max(1, parseInt(ex.quantity, 10) || 1)
      const price = Math.max(0, Number(ex.price) || 0)
      lineItems.push(...await buildProductLineItems({
        variantId: ex.variantId,
        quantity:  qty,
        unitPrice: price,
        baseTitle: ex.name || 'Допълнителен продукт',
        suffix:    price <= 0 ? '(подарък — инфлуенсър)' : '(добавено от админ)',
      }))
      combinedPaid += price * qty
      extraLines.push(`- ${ex.name || 'Продукт'}: ${qty} бр. (${(price * qty).toFixed(2)} €)`)
    }
  } catch (err) {
    return NextResponse.json({ error: `Shopify Order error: ${err.message}` }, { status: 502 })
  }

  // Колко от сумата е платено от комисионната (paid_total вече е с override-натата цена)
  // Частта от комисионната на всяка заявка не може да надвиши новата ѝ сума
  const commissionById = {}
  for (const r of reqs) {
    if (r.payment_method !== 'commission') continue
    commissionById[r.id] = Math.round(Math.min(commissionPart(r), updatedTotals[r.id] || 0) * 100) / 100
  }
  const fromCommission = Object.values(commissionById).reduce((a, b) => a + b, 0)

  // Доставка — от избраната заявка (по подразбиране първата от списъка)
  const shipReq = reqs.find(r => r.id === body.shippingFromId) || reqs[0]
  const ship = await buildShipping(shipReq, influencer.name)
  if (!ship.ok) return NextResponse.json({ error: ship.error }, { status: 400 })
  const { methodLabel, firstName, lastName, shippingAddress, noteAttributes } = ship

  let shopifyOrder
  try {
    const isMerged = reqs.length > 1
    const noteLines = [
      `${isMerged ? 'Обединена заявка' : 'Заявка'} от инфлуенсър: ${influencer.name} (${influencer.promo_code})`,
      ...(isMerged ? [`Брой обединени заявки: ${reqs.length}`] : []),
      'Продукти:',
      ...productLines,
      ...(extraLines.length ? ['Допълнително (мърч):', ...extraLines] : []),
      `Обща сума: ${combinedPaid.toFixed(2)} €`,
      ...(fromCommission > 0 ? [`💳 От тях платени от комисионната на инфлуенсъра: ${fromCommission.toFixed(2)} €`] : []),
      `ЗА СЪБИРАНЕ (наложен платеж): ${(combinedPaid - fromCommission).toFixed(2)} €`,
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
        ...(isMerged ? ['merged'] : []),
        ...(fromCommission > 0 ? ['paid-from-commission'] : []),
        ...(extraLines.length ? ['merch-added'] : []),
        influencer.promo_code,
        `shipping-${shipReq.shipping_method || 'unknown'}`,
      ].filter(Boolean),
      shippingAddress,
      noteAttributes,
      payment: { fromCommission },
    })
  } catch (err) {
    return NextResponse.json({ error: `Shopify Order error: ${err.message}` }, { status: 502 })
  }

  // Всички обединени заявки сочат към една и съща Shopify поръчка
  const partialOk = await partialPaymentSupported()
  const orderId = String(shopifyOrder?.id || '')
  const results = await Promise.all(reqs.map(r =>
    supabaseAdmin
      .from('product_requests')
      .update({
        status:                 'sent_to_shopify',
        shopify_draft_order_id: orderId,
        paid_total:             updatedTotals[r.id],
        ...(commissionById[r.id] !== undefined && partialOk ? { paid_from_commission: commissionById[r.id] } : {}),
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
