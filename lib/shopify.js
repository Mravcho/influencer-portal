// Shopify Admin API – извличане на поръчки по промокод

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

// Създава price rule + discount code в Shopify
// percentage = положително число (напр. 5 → -5%)
export async function createDiscountCode({ code, percentage, collectionIds = [], title }) {
  const ruleBody = {
    price_rule: {
      title:              title || `Influencer ${code}`,
      target_type:        'line_item',
      target_selection:   collectionIds.length > 0 ? 'entitled' : 'all',
      allocation_method:  'across',
      value_type:         'percentage',
      value:              `-${parseFloat(percentage)}`,
      customer_selection: 'all',
      starts_at:          new Date().toISOString(),
    },
  }
  if (collectionIds.length > 0) {
    ruleBody.price_rule.entitled_collection_ids = collectionIds
  }

  const ruleResp = await shopifyPost('/price_rules.json', ruleBody)
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

const shopifyDelete = async (endpoint) => {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${endpoint}`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
  })
  if (!res.ok) throw new Error(`Shopify DELETE ${res.status}`)
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

export async function fetchOrdersByPromoCode(promoCode, since = null) {
  let allOrders = []
  let pageInfo = null
  const FIELDS = [
    'id', 'order_number', 'created_at',
    'total_price', 'currency',
    'financial_status', 'fulfillment_status',
    'line_items', 'discount_codes', 'discount_applications',
    'shipping_lines',
    // Customer info за admin feed
    'email', 'contact_email', 'phone',
    'customer', 'shipping_address', 'billing_address',
  ].join(',')

  do {
    // Shopify: page_info при pagination не може да се комбинира с другите филтри
    // (limit, status, created_at_min, fields) — заявката трябва да е САМО с page_info + limit
    const params = pageInfo
      ? { page_info: pageInfo, limit: 250 }
      : {
          status: 'any',
          limit: 250,
          fields: FIELDS,
          ...(since ? { created_at_min: since } : {}),
        }

    const data = await shopifyFetch('/orders.json', params)
    const orders = data.orders || []
    allOrders = allOrders.concat(orders)
    pageInfo = data._nextPageInfo || null
  } while (pageInfo)

  const filtered = allOrders.filter(order =>
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
    financial_status:        order.financial_status,
    fulfillment_status:      order.fulfillment_status || 'unfulfilled',
    line_items:              lineItems,
    total_savings:           Math.round(totalSavings * 100) / 100,
    commissionable_revenue:  Math.round(commissionableRevenue * 100) / 100,
    shipping_total:          Math.round(shippingTotal * 100) / 100,
    customer_name:           customerName,
    customer_email:          order.email || order.contact_email || order.customer?.email || null,
    customer_phone:          shippingAddr.phone || order.phone || order.customer?.phone || null,
    shipping_city:           shippingAddr.city || null,
  }
}
