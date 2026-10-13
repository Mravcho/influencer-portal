import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { oldCodesSupported, planCodeUpgrade, upgradeInfluencerCode } from '@/lib/influencer-codes'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// Преминаване към нови кодове ИМЕ<pct> (REALNETI5 → REALNETI10).
// Новият код копира продуктите/колекциите и условията на стария, само с новата
// отстъпка. Старият остава активен в Shopify и поръчките по него продължават да
// се засичат към същия инфлуенсър.

function parsePct(v) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n > 0 && n < 100 ? n : null
}

async function activeWithCodes(ids = null) {
  let q = supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, platform, active')
    .eq('active', true)
    .not('promo_code', 'is', null)
    .order('name')
  if (ids) q = q.in('id', ids)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

// GET ?pct=10 → преглед: какъв ще е новият код на всеки и дали може
export async function GET(request) {
  const pct = parsePct(new URL(request.url).searchParams.get('pct') || '10')
  if (!pct) return NextResponse.json({ error: 'Невалиден процент' }, { status: 400 })
  try {
    const list = await activeWithCodes()
    const rows = []
    for (const inf of list) {
      let plan
      try { plan = await planCodeUpgrade(inf, pct) }
      catch (err) { plan = { status: 'error', reason: err.message } }
      rows.push({ id: inf.id, name: inf.name, code: inf.promo_code, ...plan })
    }
    return NextResponse.json({ pct, migrated: await oldCodesSupported(), rows })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST { pct, ids: [] } → създава новите кодове за избраните инфлуенсъри
export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const pct = parsePct(body.pct)
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 200) : []
  if (!pct) return NextResponse.json({ error: 'Невалиден процент' }, { status: 400 })
  if (!ids.length) return NextResponse.json({ error: 'Не са избрани инфлуенсъри' }, { status: 400 })
  if (!(await oldCodesSupported())) {
    return NextResponse.json({ error: 'Първо пусни supabase/migration_old_codes.sql в Supabase' }, { status: 400 })
  }

  const results = []
  for (const inf of await activeWithCodes(ids)) {
    try {
      results.push({ id: inf.id, name: inf.name, code: inf.promo_code, ...await upgradeInfluencerCode(inf, pct) })
    } catch (err) {
      results.push({ id: inf.id, name: inf.name, code: inf.promo_code, status: 'error', reason: err.message })
    }
  }
  return NextResponse.json({ pct, results })
}
