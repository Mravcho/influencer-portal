import { supabaseAdmin } from './supabase'
import { shopifyGraphQL } from './shopify'
import { normalizeFinancialStatus } from './order-flags'

// Колоната cancelled_at идва с migration_order_cancelled.sql. Докато тя не е
// пусната, писането ѝ би счупило целия upsert — затова проверяваме веднъж на
// студен старт дали съществува и я включваме само тогава.
let cancelledAtSupport = null
export async function ordersHaveCancelledAt() {
  if (cancelledAtSupport !== null) return cancelledAtSupport
  const { error } = await supabaseAdmin.from('orders').select('cancelled_at').limit(1)
  cancelledAtSupport = !error
  if (!cancelledAtSupport) {
    console.warn('orders.cancelled_at липсва — пусни supabase/migration_order_cancelled.sql')
  }
  return cancelledAtSupport
}

// GraphQL enum → стойностите, които пазим (REST стил, малки букви).
const toRest = (v) => (v ? String(v).toLowerCase() : null)

// Пре-тегля от Shopify актуалния статус на подадените поръчки и обновява само
// онези, при които нещо се е променило. Използва GraphQL nodes() — 1 заявка на
// 100 поръчки вместо 1 REST заявка на поръчка.
export async function refreshOrderStatuses(orders, { batchSize = 100 } = {}) {
  const withCancelled = await ordersHaveCancelledAt()
  let checked = 0
  const changed = []

  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize)
    const ids = batch.map(o => `gid://shopify/Order/${o.shopify_order_id}`)

    let data
    try {
      data = await shopifyGraphQL(
        `query($ids:[ID!]!){
          nodes(ids:$ids){
            ... on Order {
              id
              cancelledAt
              displayFinancialStatus
              displayFulfillmentStatus
            }
          }
        }`,
        { ids }
      )
    } catch (err) {
      console.error('refreshOrderStatuses: batch failed:', err.message)
      continue
    }

    const byId = new Map()
    for (const node of data?.nodes || []) {
      if (!node?.id) continue
      byId.set(String(node.id).split('/').pop(), node)
    }

    for (const stored of batch) {
      const node = byId.get(String(stored.shopify_order_id))
      if (!node) continue
      checked++

      const cancelledAt = node.cancelledAt || null
      const fin = normalizeFinancialStatus(toRest(node.displayFinancialStatus), cancelledAt)
      const ful = toRest(node.displayFulfillmentStatus) || 'unfulfilled'

      const finChanged = fin !== (stored.financial_status || '').toLowerCase()
      const fulChanged = ful !== (stored.fulfillment_status || 'unfulfilled').toLowerCase()
      const cancelChanged = withCancelled &&
        (cancelledAt || null) !== (stored.cancelled_at || null)

      if (!finChanged && !fulChanged && !cancelChanged) continue

      const patch = {
        financial_status:   fin,
        fulfillment_status: ful,
        synced_at:          new Date().toISOString(),
      }
      if (withCancelled) patch.cancelled_at = cancelledAt

      const { error } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', stored.id)

      if (error) {
        console.error(`refreshOrderStatuses: update ${stored.shopify_order_id} failed:`, error.message)
        continue
      }

      changed.push({
        shopify_order_id: stored.shopify_order_id,
        order_number:     stored.order_number,
        from:             stored.financial_status,
        to:               fin,
        cancelled_at:     cancelledAt,
      })
    }
  }

  return { checked, updated: changed.length, changed }
}
