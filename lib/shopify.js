// Shopify Admin API – извличане на поръчки по промокод

import { normalizeFinancialStatus } from './order-flags'

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const API_VERSION    = '2026-01'

// Извлича page_info от Shopify Link header за cursor-based pagination
function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null
  // Формат: <https://...?page_info=xxx>; rel="next", <https://...?page_info=yyy>; rel="previous"
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/)
  if (!match) return null
  try {
    const u = new URL(match[1])
    return u.searchParams.get('page_info')
  } catch {
    return null
  }
}

const shopifyFetch = async (endpoint, params = {}) => {
  const url = new URL(`https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${endpoint}`)
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 300 },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  // Прикрепяме page_info за pagination (за орди endpoint)
  data._nextPageInfo = parseNextPageInfo(res.headers.get('link'))
  return data
}

const shopifyPost = async (endpoint, body) => {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${text}`)
  }
  return res.json()
}

// Намира numeric ID-тата на поръчките с даден отстъпков код чрез GraphQL
// server-side филтър (discount_code:), вместо да сканираме целия магазин.
// case-insensitive от страна на Shopify search-а.
// dateField: 'created_at' (нови поръчки) или 'updated_at' (променени поръчки —
// анулиране, рефунд, плащане, изпращане на вече записана поръчка).
async function fetchOrderIdsByDiscountCode(promoCode, since = null, dateField = 'created_at') {
  const parts = [`discount_code:${promoCode}`]
  if (since) parts.push(`${dateField}:>='${since}'`)
  const q = parts.join(' AND ')

  const ids = []
  let after = null
  do {
    const data = await shopifyGraphQL(
      `query($q:String!,$after:String){
        orders(first:100, query:$q, after:$after){
          edges{ node{ id } }
          pageInfo{ hasNextPage endCursor }
        }
      }`,
      { q, after }
    )
    const conn = data?.orders
    if (!conn) break
    for (const e of conn.edges) {
      const num = String(e.node.id).split('/').pop() // gid://shopify/Order/123 → 123
      if (num) ids.push(num)
    }
    after = conn.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null
  } while (after)

  return ids
}

// Извлича всички колекции (custom + smart) — за picker-а в admin
export async function fetchAllCollections() {
  const [custom, smart] = await Promise.all([
    shopifyFetch('/custom_collections.json', { limit: 250, fields: 'id,title,handle' }),
    shopifyFetch('/smart_collections.json',  { limit: 250, fields: 'id,title,handle' }),
  ])
  return [
    ...(custom.custom_collections || []),
    ...(smart.smart_collections   || []),
  ].sort((a, b) => a.title.localeCompare(b.title))
}

// Създава price rule + discount code в Shopify.
// Поддържани опции (всички освен code/value са по избор):
//   valueType       'percentage' | 'fixed_amount'  (по подр. percentage)
//   value           положително число (5 → -5% или -5 €); legacy: percentage
//   collectionIds   [] → важи само за тези колекции
//   variantIds      [] → важи само за тези продукти/варианти
//   minSubtotal     минимална сума на поръчката (€)
//   minQuantity     минимален брой артикули
//   usageLimit      общ лимит употреби
//   oncePerCustomer веднъж на клиент
//   startsAt/endsAt валидност
export async function createDiscountCode({
  code, title,
  percentage,
  valueType = 'percentage',
  value,
  collectionIds = [],
  variantIds = [],
  minSubtotal = null,
  minQuantity = null,
  usageLimit = null,
  oncePerCustomer = false,
  startsAt = null,
  endsAt = null,
}) {
  const amount   = value != null && value !== '' ? value : percentage
  const entitled = collectionIds.length > 0 || variantIds.length > 0

  const rule = {
    title:              title || `Influencer ${code}`,
    target_type:        'line_item',
    target_selection:   entitled ? 'entitled' : 'all',
    allocation_method:  'across',
    value_type:         valueType,
    value:              `-${Math.abs(parseFloat(amount))}`,
    customer_selection: 'all',
    starts_at:          startsAt || new Date().toISOString(),
  }
  if (endsAt) rule.ends_at = endsAt
  if (collectionIds.length > 0) rule.entitled_collection_ids = collectionIds.map(Number)
  if (variantIds.length > 0)    rule.entitled_variant_ids    = variantIds.map(Number)
  // Само едно prerequisite: предимство на минимална сума пред количество
  if (minSubtotal != null && minSubtotal !== '') {
    rule.prerequisite_subtotal_range = { greater_than_or_equal_to: String(minSubtotal) }
  } else if (minQuantity != null && minQuantity !== '') {
    rule.prerequisite_quantity_range = { greater_than_or_equal_to: parseInt(minQuantity) }
  }
  if (usageLimit != null && usageLimit !== '') rule.usage_limit = parseInt(usageLimit)
  if (oncePerCustomer) rule.once_per_customer = true

  const ruleResp = await shopifyPost('/price_rules.json', { price_rule: rule })
  const priceRuleId = ruleResp.price_rule?.id
  if (!priceRuleId) throw new Error('Shopify не върна price_rule.id')

  try {
    const codeResp = await shopifyPost(
      `/price_rules/${priceRuleId}/discount_codes.json`,
      { discount_code: { code } }
    )
    return {
      priceRuleId,
      discountCodeId: codeResp.discount_code?.id,
      code,
    }
  } catch (err) {
    // Ако кодът е дубликат — изтриваме сиракото price_rule
    try { await shopifyDelete(`/price_rules/${priceRuleId}.json`) } catch {}
    throw err
  }
}

export const shopifyGraphQL = async (query, variables = {}) => {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify GraphQL error ${res.status}: ${text}`)
  }
  const data = await res.json()
  if (data.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(data.errors)}`)
  return data.data
}

// Връща компонентите на bundle вариант, или null ако вариантът НЕ е bundle.
// Shopify не позволява bundle вариант (с компоненти) да се добави директно като
// line item в поръчка — трябва да добавим компонентните варианти поотделно.
// Резултат: [{ variantId: '123', quantity: 2, price: 7.0, title: 'Колаген ...' }]
export async function fetchVariantComponents(variantId) {
  if (!variantId) return null
  const gid = `gid://shopify/ProductVariant/${variantId}`
  const data = await shopifyGraphQL(`
    query($id: ID!) {
      productVariant(id: $id) {
        requiresComponents
        productVariantComponents(first: 50) {
          nodes {
            quantity
            productVariant { id title price product { title } }
          }
        }
      }
    }
  `, { id: gid })

  const v = data?.productVariant
  if (!v || !v.requiresComponents) return null
  const nodes = v.productVariantComponents?.nodes || []
  if (nodes.length === 0) return null

  return nodes.map(n => ({
    variantId: String(n.productVariant.id).split('/').pop(),
    quantity:  n.quantity || 1,
    price:     parseFloat(n.productVariant.price || 0),
    title:     n.productVariant.product?.title || n.productVariant.title || 'Компонент',
  }))
}

// Връща utm_content (= нашия alias) от Customer Journey на поръчката.
// Shopify НЕ записва utm параметрите в landing URL-а — държи ги в
// customerJourneySummary. Ползваме lastVisit (last-click), после firstVisit.
// Връща lowercase alias или null.
export async function fetchOrderUtmContent(orderId) {
  if (!orderId) return null
  const gid = `gid://shopify/Order/${orderId}`
  try {
    const data = await shopifyGraphQL(`
      query($id: ID!) {
        order(id: $id) {
          customerJourneySummary {
            lastVisit  { utmParameters { content } }
            firstVisit { utmParameters { content } }
          }
        }
      }
    `, { id: gid })
    const cj = data?.order?.customerJourneySummary
    const content = cj?.lastVisit?.utmParameters?.content || cj?.firstVisit?.utmParameters?.content || null
    return content ? String(content).toLowerCase().trim() : null
  } catch (err) {
    console.error(`fetchOrderUtmContent(${orderId}) failed:`, err.message)
    return null
  }
}

// Търси Shopify продукти по име/SKU за admin picker-а (добавяне на доп. продукти / мърч).
// Връща плосък списък от варианти: [{ variantId, name, variantTitle, price, image }]
export async function searchProducts(queryStr) {
  const q = (queryStr || '').trim()
  if (!q) return []
  const data = await shopifyGraphQL(`
    query($q: String!) {
      products(first: 10, query: $q) {
        nodes {
          title
          featuredImage { url }
          variants(first: 25) {
            nodes { id title price image { url } }
          }
        }
      }
    }
  `, { q })

  const out = []
  for (const p of data?.products?.nodes || []) {
    for (const v of p.variants?.nodes || []) {
      out.push({
        variantId:    String(v.id).split('/').pop(),
        name:         p.title,
        variantTitle: v.title && v.title !== 'Default Title' ? v.title : null,
        price:        parseFloat(v.price || 0),
        image:        v.image?.url || p.featuredImage?.url || null,
      })
    }
  }
  return out
}

const shopifyDelete = async (endpoint) => {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${endpoint}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
  })
  if (!res.ok) throw new Error(`Shopify DELETE ${res.status}`)
}

// Изтрива промокод (price rule + кода) от Shopify по самия код.
// Връща { deleted, reason? }. Не хвърля при „не намерен".
export async function deleteDiscountCode(code) {
  if (!code) return { deleted: false, reason: 'no code' }
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/discount_codes/lookup.json?code=${encodeURIComponent(code)}`
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } })
  if (res.status === 404) return { deleted: false, reason: 'not found' }
  if (!res.ok) throw new Error(`Shopify lookup ${res.status}`)
  const data = await res.json()
  const priceRuleId = data?.discount_code?.price_rule_id
  if (!priceRuleId) return { deleted: false, reason: 'no price rule' }
  await shopifyDelete(`/price_rules/${priceRuleId}.json`) // трие и кодовете под него
  return { deleted: true, priceRuleId }
}

// Извлича product details (име, снимка, цена, default variant) — за picker-а в каталога за заявки.
// Връща null ако продуктът не съществува или е скрит.
export async function fetchProductById(productId) {
  try {
    const data = await shopifyFetch(`/products/${productId}.json`, {
      fields: 'id,title,image,variants',
    })
    const p = data.product
    if (!p) return null
    const variant = (p.variants || [])[0] || {}
    return {
      shopify_product_id: String(p.id),
      shopify_variant_id: variant.id ? String(variant.id) : null,
      name:               p.title,
      image_url:          p.image?.src || null,
      price:              parseFloat(variant.price || 0),
    }
  } catch (err) {
    console.error(`fetchProductById(${productId}) failed:`, err.message)
    return null
  }
}

// Създава Shopify Order (реална поръчка, не draft).
// Параметри:
//   lineItems        — масив { variant_id, quantity, applied_discount? }
//   note             — текст за вътрешни бележки в Shopify Admin
//   customer         — { first_name, last_name, phone, email? } — НЕ подавай email
//                     ако не искаш Shopify да matches съществуващ клиент
//   tags             — масив от тагове (или string)
//   shippingAddress  — { first_name, last_name, address1, city, zip, phone, country_code, ... }
//                      city е задължителен за BG поръчки!
// Връща обекта на поръчката от Shopify (id, order_number, total_price, ...) или хвърля грешка.
//
// Бележка: НЕ пращаме transactions. Shopify не позволява $0 sale транзакции,
// а смесените заявки и без това трябва admin да маркира платени ръчно. Поръчките
// идват с financial_status = pending; admin маркира paid с един клик в Shopify Admin.
export async function createOrder({
  lineItems,
  note = '',
  customer = null,
  tags = [],
  shippingAddress = null,
}) {
  const body = {
    order: {
      line_items:           lineItems,
      note,
      tags:                 Array.isArray(tags) ? tags.join(', ') : tags,
      // По подразбиране намалява инвентара — поведение като нормална поръчка
      inventory_behaviour:  'decrement_obligatory',
      // Не пращаме автоматични имейли — admin контролира комуникацията
      send_receipt:         false,
      send_fulfillment_receipt: false,
      ...(customer ? { customer } : {}),
      ...(shippingAddress ? { shipping_address: shippingAddress } : {}),
    },
  }
  const res = await shopifyPost('/orders.json', body)
  return res.order
}

// Създава Shopify Draft Order. line_items е масив { variant_id, quantity, applied_discount? }
// applied_discount = { value_type: 'percentage', value: '15.0', title: 'Influencer' }
// shippingAddress = { first_name, last_name, address1, phone, country, country_code, ... } (optional)
// Връща { id, invoice_url, ... } или хвърля грешка.
export async function createDraftOrder({ lineItems, note = '', customerEmail = null, tags = [], shippingAddress = null }) {
  const body = {
    draft_order: {
      line_items: lineItems,
      note,
      tags: Array.isArray(tags) ? tags.join(', ') : tags,
      ...(customerEmail ? { email: customerEmail } : {}),
      ...(shippingAddress ? { shipping_address: shippingAddress } : {}),
    },
  }
  const res = await shopifyPost('/draft_orders.json', body)
  return res.draft_order
}

// Извлича image URL за списък от product IDs (с in-memory cache в рамките на 1 sync)
export async function fetchProductImages(productIds) {
  const unique = [...new Set(productIds.filter(Boolean))]
  const result = {}
  await Promise.all(unique.map(async (pid) => {
    try {
      const data = await shopifyFetch(`/products/${pid}.json`, { fields: 'image' })
      result[pid] = data.product?.image?.src || null
    } catch {
      result[pid] = null
    }
  }))
  return result
}

export async function fetchOrdersByPromoCode(promoCode, since = null, dateField = 'created_at') {
  const FIELDS = [
    'id', 'order_number', 'created_at',
    'total_price', 'currency',
    'financial_status', 'fulfillment_status', 'cancelled_at',
    'line_items', 'discount_codes', 'discount_applications',
    'shipping_lines',
    // За кампанийна UTM атрибуция
    'landing_site', 'referring_site',
    // Customer info за admin feed
    'email', 'contact_email', 'phone',
    'customer', 'shipping_address', 'billing_address',
  ].join(',')

  // 1) Server-side филтър по код → само ID-тата на релевантните поръчки.
  //    (Преди тук се сканираше ЦЕЛИЯТ магазин, което timeout-ваше при много поръчки.)
  const ids = await fetchOrderIdsByDiscountCode(promoCode, since, dateField)
  if (ids.length === 0) return []

  // 2) Теглим пълните REST данни само за тези поръчки (нужни за sanitizeOrder:
  //    discount_allocations, shipping_lines, customer и т.н.)
  const orders = []
  for (const id of ids) {
    try {
      const data = await shopifyFetch(`/orders/${id}.json`, { fields: FIELDS })
      if (data.order) orders.push(data.order)
    } catch (err) {
      console.error(`fetchOrdersByPromoCode: order ${id} fetch failed:`, err.message)
    }
  }

  // Двойна проверка, че кодът наистина е по поръчката (search-ът е широк)
  const filtered = orders.filter(order =>
    order.discount_codes?.some(
      dc => dc.code?.toUpperCase() === promoCode.toUpperCase()
    )
  )

  // Тегли снимките на всички уникални продукти от тези поръчки наведнъж
  const productIds = filtered.flatMap(o => (o.line_items || []).map(li => li.product_id))
  const productImages = await fetchProductImages(productIds)

  return filtered.map(order => sanitizeOrder(order, promoCode, productImages))
}

function sanitizeOrder(order, promoCode, productImages = {}) {
  // Доставка
  const shippingTotal = (order.shipping_lines || []).reduce(
    (s, line) => s + parseFloat(line.price || 0), 0
  )

  // Спестяване от discount_codes (винаги надеждно)
  const codeEntry = (order.discount_codes || []).find(
    dc => dc.code?.toUpperCase() === promoCode.toUpperCase()
  )
  const savingsFromCode = parseFloat(codeEntry?.amount || 0)

  // Индекс в discount_applications
  const promoAppIndex = (order.discount_applications || []).findIndex(
    app => app.code?.toUpperCase() === promoCode.toUpperCase()
  )

  let commissionableRevenue = 0
  let totalSavings = 0
  let anyDiscounted = false

  let lineItems = (order.line_items || []).map(item => {
    const fullPrice    = parseFloat(item.price) * item.quantity
    let discountAmount = 0
    let isDiscounted   = false

    if (promoAppIndex >= 0) {
      const alloc = (item.discount_allocations || []).find(
        a => a.discount_application_index === promoAppIndex
      )
      discountAmount = alloc ? parseFloat(alloc.amount) : 0
      isDiscounted   = discountAmount > 0
    }

    if (isDiscounted) {
      anyDiscounted = true
      commissionableRevenue += fullPrice
      totalSavings          += discountAmount
    }

    return {
      title:           item.title,
      variant:         item.variant_title,
      quantity:        item.quantity,
      price:           parseFloat(item.price),
      discount_amount: Math.round(discountAmount * 100) / 100,
      discounted:      isDiscounted,
      sku:             item.sku,
      image_url:       productImages[item.product_id] || null,
    }
  })

  // Fallback: discount_allocations не са върнали match → всички продукти са комисионни
  if (!anyDiscounted) {
    commissionableRevenue = 0
    lineItems = lineItems.map(item => {
      commissionableRevenue += item.price * item.quantity
      return { ...item, discounted: true }
    })
    totalSavings = savingsFromCode
  }

  // Customer info за admin feed
  const shippingAddr = order.shipping_address || order.billing_address || {}
  const customerName = [
    shippingAddr.first_name || order.customer?.first_name,
    shippingAddr.last_name  || order.customer?.last_name,
  ].filter(Boolean).join(' ').trim() || null

  return {
    shopify_order_id:        order.id,
    order_number:            `#${order.order_number}`,
    created_at_shopify:      order.created_at,
    total_price:             parseFloat(order.total_price),
    currency:                order.currency,
    financial_status:        normalizeFinancialStatus(order.financial_status, order.cancelled_at),
    fulfillment_status:      order.fulfillment_status || 'unfulfilled',
    cancelled_at:            order.cancelled_at || null,
    line_items:              lineItems,
    total_savings:           Math.round(totalSavings * 100) / 100,
    commissionable_revenue:  Math.round(commissionableRevenue * 100) / 100,
    shipping_total:          Math.round(shippingTotal * 100) / 100,
    customer_name:           customerName,
    customer_email:          order.email || order.contact_email || order.customer?.email || null,
    customer_phone:          shippingAddr.phone || order.phone || order.customer?.phone || null,
    shipping_city:           shippingAddr.city || null,
    landing_site:            order.landing_site || null,
    referring_site:          order.referring_site || null,
  }
}
