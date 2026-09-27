import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { productPaymentSupported } from '@/lib/product-payment'
import { fetchShipments } from '@/lib/request-deliveries'

export const dynamic = 'force-dynamic'

// GET → история на заявките за текущия инфлуенсър (всички статуси)
export async function GET(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,${await productPaymentSupported() ? ' payment_method,' : ''}
      status, requested_at, fulfilled_at, shopify_draft_order_id,
      shipping_method, shipping_recipient, shipping_phone, shipping_location,
      product:request_products(id, name, image_url, paid_discount_pct)
    `)
    .eq('influencer_id', influencerId)
    .order('requested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Изпратените — с товарителницата от Shopify, за да си следи пратката
  const sent = (data || []).filter(r => r.status === 'sent_to_shopify' && r.shopify_draft_order_id)
  let shipments = {}
  if (sent.length) {
    try { shipments = await fetchShipments(sent.map(r => r.shopify_draft_order_id)) }
    catch (err) { console.error('my-product-requests shipments failed:', err.message) }
  }
  return NextResponse.json((data || []).map(({ shopify_draft_order_id, ...r }) => {
    const s = r.status === 'sent_to_shopify' ? shipments[String(shopify_draft_order_id)] : null
    return s ? { ...r, shipment: { status: s.status, tracking: s.tracking } } : r
  }))
}
