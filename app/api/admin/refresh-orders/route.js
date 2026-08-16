import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshOrderStatuses, ordersHaveCancelledAt, fetchAllRows } from '@/lib/order-status'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// POST /api/admin/refresh-orders — ръчно пускане на същата проверка, която
// седмичният cron прави (/api/cron/refresh-orders). Само сверява статуси —
// нищо не се трие и не се създава.
//   ?influencer_id=uuid → само поръчките на един инфлуенсър
//   ?days=N             → само поръчки от последните N дни
export async function POST(request) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get('influencer_id')
  const days = parseInt(searchParams.get('days') || '0', 10)

  const withCancelled = await ordersHaveCancelledAt()
  const columns = ['id', 'shopify_order_id', 'order_number', 'financial_status', 'fulfillment_status']
  if (withCancelled) columns.push('cancelled_at')

  const buildQuery = (from, to) => {
    let q = supabaseAdmin
      .from('orders')
      .select(columns.join(', '))
      .order('created_at_shopify', { ascending: false })
      .range(from, to)
    if (influencerId) q = q.eq('influencer_id', influencerId)
    if (days > 0) {
      q = q.gte('created_at_shopify', new Date(Date.now() - days * 86400000).toISOString())
    }
    return q
  }

  let orders
  try {
    orders = await fetchAllRows(buildQuery)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const result = await refreshOrderStatuses(orders)
  return NextResponse.json({
    ok: true,
    total: orders.length,
    cancelledAtColumn: withCancelled,
    ...result,
  })
}
