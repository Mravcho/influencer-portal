import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { refreshOrderStatuses, ordersHaveCancelledAt, fetchAllRows } from '@/lib/order-status'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// Седмичен cron: минава ВСИЧКИ записани поръчки и сверява статуса им с Shopify
// (платена / анулирана / рефунднати / изпратена). Webhook-ите и часовият sync
// хващат промените в момента, но ако някой webhook се изгуби, тук се оправя.
//
// Пътят НЕ е под /api/admin, за да минава покрай middleware-а (Vercel cron
// праща GET без cookie).
//
// ?days=N  → само поръчки, създадени в последните N дни (по подр. всички)
// ?limit=N → таван на броя проверени поръчки в едно изпълнение
async function run(request) {
  const auth = request.headers.get('authorization')
  const isCron  = !process.env.CRON_SECRET || auth === `Bearer ${process.env.CRON_SECRET}`
  const isAdmin = request.headers.get('x-user-role') === 'admin'
  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const days  = parseInt(searchParams.get('days')  || '0', 10)
  const limit = parseInt(searchParams.get('limit') || '5000', 10)

  const withCancelled = await ordersHaveCancelledAt()
  const columns = ['id', 'shopify_order_id', 'order_number', 'financial_status', 'fulfillment_status']
  if (withCancelled) columns.push('cancelled_at')

  const buildQuery = (from, to) => {
    let q = supabaseAdmin
      .from('orders')
      .select(columns.join(', '))
      .order('created_at_shopify', { ascending: false })
      .range(from, to)
    if (days > 0) {
      q = q.gte('created_at_shopify', new Date(Date.now() - days * 86400000).toISOString())
    }
    return q
  }

  let orders
  try {
    orders = await fetchAllRows(buildQuery, { max: Math.min(Math.max(limit, 1), 20000) })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const result = await refreshOrderStatuses(orders)

  return NextResponse.json({
    ok: true,
    total: orders.length,
    cancelledAtColumn: withCancelled,
    ...result,
    ranAt: new Date().toISOString(),
  })
}

export async function GET(request)  { return run(request) }
export async function POST(request) { return run(request) }
