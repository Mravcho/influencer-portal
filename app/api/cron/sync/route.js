import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncInfluencer } from '@/lib/sync'
import { syncRequestDeliveries } from '@/lib/request-deliveries'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// Часовият sync на поръчките. Стои под /api/cron, а не под /api/admin, защото
// Vercel cron праща GET без cookie — middleware-ът пази целия /api/admin и
// пренасочваше cron-а към /login (затова досега часовият sync не се е случвал
// изобщо и всичко висеше на webhook-ите).
async function run(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: influencers, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, commission, email, email_notifications')
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results = []
  for (const influencer of influencers || []) {
    results.push(await syncInfluencer(influencer))
  }

  // Заявки за продукти: затваряме тези, чиито пратки са доставени
  let deliveries = null
  try {
    const { checked, delivered } = await syncRequestDeliveries()
    deliveries = { checked, delivered }
  } catch (err) {
    console.error('Request deliveries sync failed:', err.message)
    deliveries = { error: err.message }
  }

  return NextResponse.json({ ok: true, results, deliveries, ranAt: new Date().toISOString() })
}

export async function GET(request)  { return run(request) }
export async function POST(request) { return run(request) }
