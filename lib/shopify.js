// Shopify Admin API – извличане на поръчки по промокод

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const API_VERSION    = '2026-01'

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
  return res.json()
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

  do {
    const params = {
      discount_code: promoCode,
      status: 'any',
      limit: 250,
      fields: [
        'id', 'order_number', 'created_at',
        'total_price', 'currency',
        'financial_status', 'fulfillment_status',
        'line_items', 'discount_codes', 'discount_applications',
        'shipping_lines',
      ].join(','),
    }

    if (since) params.created_at_min = since
    if (pageInfo) params.page_info = pageInfo

    const data = await shopifyFetch('/orders.json', params)
    const orders = data.orders || []
    allOrders = allOrders.concat(orders)

    pageInfo = data.nextPageInfo || null
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
  }
}
