import { NextResponse } from 'next/server'
import { scanUtmOrders } from '@/lib/utm-orders'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// POST /api/admin/utm-orders?days=N — обхожда поръчките в Shopify и записва
// онези, чийто landing URL носи наш alias. days=0 → от началото (по-бавно).
export async function POST(request) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const daysRaw = new URL(request.url).searchParams.get('days')
  const days = daysRaw != null ? parseInt(daysRaw, 10) : 30

  const result = await scanUtmOrders({ days: Number.isFinite(days) ? days : 30 })
  if (result.error) return NextResponse.json(result, { status: 500 })
  return NextResponse.json({ ok: true, ...result })
}
