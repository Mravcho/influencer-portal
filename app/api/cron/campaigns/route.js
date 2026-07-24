import { NextResponse } from 'next/server'
import { syncAllActiveCampaigns } from '@/lib/campaign-sync'

export const dynamic = 'force-dynamic'

// Cron backup за кампанийна атрибуция — хваща поръчки, чийто UTM не е бил
// готов при webhook-а. Vercel cron праща GET с Authorization: Bearer CRON_SECRET.
// Пътят НЕ е под /api/admin, за да минава покрай middleware-а.
async function run(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const results = await syncAllActiveCampaigns()
    return NextResponse.json({ ok: true, results, ranAt: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export const GET  = run
export const POST = run
