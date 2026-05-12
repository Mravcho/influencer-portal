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
    // Vercel Edge Cache – 5 мин (poръчките се sync-ват при нужда)
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
 * Shopify пагинира по 250 – итерираме докато вземем всичко.
 *
 * @param {string} promoCode  – напр. "MARIA15"
 * @param {string} [since]    – ISO дата, от която да вземем (за инкрементален sync)
 * @returns {Array} Масив с почистени поръчки (БЕЗ лични данни)
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
        'line_items', 'discount_codes',
      ].join(','),
    }

    if (since) params.created_at_min = since
    if (pageInfo) params.page_info = pageInfo

    const data = await shopifyFetch('/orders.json', params)
    const orders = data.orders || []
    allOrders = allOrders.concat(orders)

    // Shopify link header за следваща страница
    pageInfo = data.nextPageInfo || null
  } while (pageInfo)

  // Филтрираме само поръчките с точния промокод (Shopify понякога връща сходни)
  const filtered = allOrders.filter(order =>
    order.discount_codes?.some(
      dc => dc.code?.toUpperCase() === promoCode.toUpperCase()
    )
  )

  // Връщаме САМО анонимни данни – без имена, телефони, адреси
  return filtered.map(sanitizeOrder)
}

/**
 * Почиства поръчката от лични данни на клиента.
 * Запазва само търговски данни.
 */
function sanitizeOrder(order) {
  return {
    shopify_order_id:    order.id,
    order_number:        `#${order.order_number}`,
    created_at_shopify:  order.created_at,
    total_price:         parseFloat(order.total_price),
    currency:            order.currency,
    financial_status:    order.financial_status,
    fulfillment_status:  order.fulfillment_status || 'unfulfilled',
    line_items: (order.line_items || []).map(item => ({
      title:    item.title,
      variant:  item.variant_title,
      quantity: item.quantity,
      price:    parseFloat(item.price),
      sku:      item.sku,
    })),
    // Умишлено НЕ включваме: customer, shipping_address, billing_address,
    // email, phone, note, tags с лични данни
  }
}
