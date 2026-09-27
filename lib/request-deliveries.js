import { supabaseAdmin } from './supabase'
import { shopifyGraphQL } from './shopify'

// Заявките за продукти, изпратени като поръчка в Shopify (status 'sent_to_shopify'),
// се затварят автоматично, когато куриерът отчете доставка. Shopify пази статуса
// на пратката по товарителницата (EuShipments, Speedy, …) във fulfillment.displayStatus
// и deliveredAt — не е нужно някой ръчно да натиска „Маркирай като изпълнена“.

const SHIPMENT_QUERY = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Order {
  id name cancelledAt displayFulfillmentStatus
  fulfillments(first:5){ displayStatus deliveredAt inTransitAt trackingInfo(first:1){ company number url } }
} } }`

// Статус на пратката за всяка поръчка: { [orderId]: { name, status, deliveredAt, tracking } }
// status: 'delivered' | 'in_transit' | 'shipped' | 'not_shipped' | 'cancelled'
export async function fetchShipments(orderIds) {
  const ids = [...new Set((orderIds || []).filter(Boolean).map(String))]
  const out = {}
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const data = await shopifyGraphQL(SHIPMENT_QUERY, { ids: batch.map(id => `gid://shopify/Order/${id}`) })
    for (const o of data?.nodes || []) {
      if (!o) continue
      const id = String(o.id).split('/').pop()
      const fs = o.fulfillments || []
      const delivered = fs.find(f => f.displayStatus === 'DELIVERED' || f.deliveredAt)
      const withTracking = fs.find(f => f.trackingInfo?.[0]?.number) || fs[0]
      const t = withTracking?.trackingInfo?.[0]
      out[id] = {
        name:        o.name,
        status:      o.cancelledAt ? 'cancelled'
                   : delivered ? 'delivered'
                   : fs.some(f => f.inTransitAt || f.displayStatus === 'IN_TRANSIT' || f.displayStatus === 'OUT_FOR_DELIVERY') ? 'in_transit'
                   : fs.length ? 'shipped'
                   : 'not_shipped',
        deliveredAt: delivered?.deliveredAt || null,
        tracking:    t ? { company: t.company || null, number: t.number || null, url: t.url || null } : null,
      }
    }
  }
  return out
}

// Затваря всички изпратени заявки, чиято Shopify поръчка е доставена.
// Връща { checked, delivered } — за cron/админ отговорите.
export async function syncRequestDeliveries() {
  const { data: sent, error } = await supabaseAdmin
    .from('product_requests')
    .select('id, shopify_draft_order_id')
    .eq('status', 'sent_to_shopify')
    .not('shopify_draft_order_id', 'is', null)
  if (error) throw new Error(`sent requests lookup failed: ${error.message}`)
  if (!sent?.length) return { checked: 0, delivered: 0, shipments: {} }

  const shipments = await fetchShipments(sent.map(r => r.shopify_draft_order_id))
  let delivered = 0
  for (const r of sent) {
    const s = shipments[String(r.shopify_draft_order_id)]
    if (s?.status !== 'delivered') continue
    const { error: upErr } = await supabaseAdmin
      .from('product_requests')
      .update({ status: 'fulfilled', fulfilled_at: s.deliveredAt || new Date().toISOString() })
      .eq('id', r.id)
      .eq('status', 'sent_to_shopify')
    if (upErr) console.error(`request ${r.id} delivery update failed:`, upErr.message)
    else delivered++
  }
  return { checked: sent.length, delivered, shipments }
}

// От Shopify webhook (orders/updated): ако поръчката е доставена и е по заявка
// за продукт → затваряме заявката веднага, без да чакаме часовия cron.
export async function markDeliveredFromWebhook(order) {
  const deliveredF = (order?.fulfillments || []).find(f => f.shipment_status === 'delivered')
  if (!deliveredF) return 0
  const { data, error } = await supabaseAdmin
    .from('product_requests')
    .update({ status: 'fulfilled', fulfilled_at: deliveredF.updated_at || new Date().toISOString() })
    .eq('shopify_draft_order_id', String(order.id))
    .eq('status', 'sent_to_shopify')
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length || 0
}
