// Shopify Admin API – извличане на поръчки по промокод
// Документация: https://shopify.dev/docs/api/admin-rest/2024-01/resources/order

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const SHOPIFY_TOKEN  = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const API_VERSION    = '2024-01'

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

/**
 * Връща всички поръчки, направени с даден промокод.
 */
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

  return filtered.map(order => sanitizeOrder(order, promoCode))
}

/**
 * Почиства поръчката от лични данни.
 * Изчислява commissionable_revenue (пълна цена само на продукти с отстъпка)
 * и total_savings (спестеното от клиента чрез промокода).
 */
function sanitizeOrder(order, promoCode) {
  // Намираме индекса на нашия промокод в discount_applications
  const promoAppIndex = (order.discount_applications || []).findIndex(
    app => app.type === 'discount_code' && app.code?.toUpperCase() === promoCode.toUpperCase()
  )

  let totalSavings = 0
  let commissionableRevenue = 0

  const lineItems = (order.line_items || []).map(item => {
    const fullPrice = parseFloat(item.price) * item.quantity

    // Проверяваме дали промокодът е приложен точно за този ред
    const promoAllocation = promoAppIndex >= 0
      ? (item.discount_allocations || []).find(
          a => a.discount_application_index === promoAppIndex
        )
      : null

    const discountAmount = promoAllocation ? parseFloat(promoAllocation.amount) : 0
    const isDiscounted   = discountAmount > 0

    if (isDiscounted) {
      totalSavings          += discountAmount
      commissionableRevenue += fullPrice  // комисионна от пълната цена
    }

    return {
      title:           item.title,
      variant:         item.variant_title,
      quantity:        item.quantity,
      price:           parseFloat(item.price),
      discount_amount: Math.round(discountAmount * 100) / 100,
      discounted:      isDiscounted,
      sku:             item.sku,
    }
  })

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
  }
}
