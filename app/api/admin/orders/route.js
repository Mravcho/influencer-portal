import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/orders → списък с всички поръчки от всички инфлуенсъри (последните 200 по подразбиране)
// Параметри (optional):
//   ?influencer_id=...   филтър по конкретен инфлуенсър
//   ?search=...          търсене в име/имейл/телефон/№ поръчка/промокод
//   ?limit=100           лимит (max 500)
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get('influencer_id')
  const search       = (searchParams.get('search') || '').trim()
  const limitRaw     = parseInt(searchParams.get('limit') || '200')
  const limit        = Math.min(Math.max(limitRaw, 1), 500)

  let query = supabaseAdmin
    .from('orders')
    .select(`
      id, shopify_order_id, order_number, created_at_shopify,
      total_price, currency, financial_status, fulfillment_status,
      line_items, total_savings, commissionable_revenue, shipping_total,
      customer_name, customer_email, customer_phone, shipping_city,
      influencer:influencers(id, name, promo_code, avatar_url)
    `)
    .order('created_at_shopify', { ascending: false })
    .limit(limit)

  if (influencerId) query = query.eq('influencer_id', influencerId)

  // search — клиентско име/имейл/телефон/№ поръчка/град
  if (search) {
    const s = search.toLowerCase()
    query = query.or(
      `customer_name.ilike.%${s}%,` +
      `customer_email.ilike.%${s}%,` +
      `customer_phone.ilike.%${s}%,` +
      `order_number.ilike.%${s}%,` +
      `shipping_city.ilike.%${s}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
