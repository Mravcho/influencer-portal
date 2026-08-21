import { NextResponse } from 'next/server'
import { scanUtmOrders } from '@/lib/utm-orders'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// Ежедневен cron: досверява поръчките, дошли през UTM линк. Webhook-ът ги
// хваща в момента; тук се подсигуряваме за пропуснати доставки.
// Пътят е извън /api/admin, защото Vercel cron праща GET без cookie.
async function run(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const daysRaw = new URL(request.url).searchParams.get('days')
  const days = daysRaw != null ? parseInt(daysRaw, 10) : 30

  const result = await scanUtmOrders({ days: Number.isFinite(days) ? days : 30 })
  if (result.error) return NextResponse.json(result, { status: 500 })
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() })
}

export async function GET(request)  { return run(request) }
export async function POST(request) { return run(request) }
