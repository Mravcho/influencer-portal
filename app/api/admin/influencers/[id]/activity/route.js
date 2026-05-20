import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/influencers/[id]/activity
// Връща обобщение на pending заявките (за продукт + за изплащане) за конкретен инфлуенсър.
export async function GET(_request, { params }) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  // Заявки за продукти — pending + sent_to_shopify (активни за обработка)
  const { data: productReqs } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,
      status, requested_at, shopify_draft_order_id,
      shipping_method, shipping_location,
      product:request_products(name, image_url)
    `)
    .eq('influencer_id', id)
    .in('status', ['pending', 'sent_to_shopify'])
    .order('requested_at', { ascending: false })
    .limit(10)

  // Заявки за изплащане — pending (или с друг статус, който не е completed)
  const { data: payoutReqs } = await supabaseAdmin
    .from('payout_requests')
    .select('id, amount, status, requested_at, processed_at, notes, admin_notes')
    .eq('influencer_id', id)
    .in('status', ['pending'])
    .order('requested_at', { ascending: false })
    .limit(10)

  const pendingProductCount = (productReqs || []).filter(r => r.status === 'pending').length
  const pendingPayoutCount  = (payoutReqs || []).length

  return NextResponse.json({
    productRequests: productReqs || [],
    payoutRequests:  payoutReqs  || [],
    pendingProductCount,
    pendingPayoutCount,
  })
}
