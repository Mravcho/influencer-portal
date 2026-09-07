import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkDiscountCodesExist, createDiscountCode } from '@/lib/shopify'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

// Кодът трябва да е само латиница/цифри. Кирилско „М" вместо латинско „M"
// изглежда еднакво, но Shopify никога няма да го намери — и поръчките с
// този код не се засичат.
const NON_LATIN = /[^\x20-\x7E]/

// GET /api/admin/influencers/codes
// → кои инфлуенсъри имат промокод, който не съществува в Shopify
export async function GET() {
  const { data: influencers, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code, active')
    .not('promo_code', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = influencers || []
  const existing = await checkDiscountCodesExist(list.map(i => i.promo_code))

  const problems = {}
  for (const inf of list) {
    const code = inf.promo_code
    if (NON_LATIN.test(code)) {
      // Показваме кой точно знак е проблемен — иначе не се вижда с око.
      const bad = [...code].filter(c => NON_LATIN.test(c)).join(' ')
      problems[inf.id] = { code, reason: 'non_latin', badChars: bad }
    } else if (existing[code] === false) {
      problems[inf.id] = { code, reason: 'missing' }
    }
    // existing[code] === null → проверката е пропаднала, не твърдим нищо
  }

  return NextResponse.json({
    checked: list.length,
    problems,
    checkedAt: new Date().toISOString(),
  })
}

// POST /api/admin/influencers/codes { id, percentage, collection_id }
// → създава липсващия код в Shopify за конкретен инфлуенсър
export async function POST(request) {
  const { id, percentage, collection_id } = await request.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'Липсва инфлуенсър' }, { status: 400 })

  const pct = parseFloat(percentage)
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return NextResponse.json({ error: 'Отстъпката трябва да е между 0 и 100%' }, { status: 400 })
  }

  const { data: inf, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, promo_code')
    .eq('id', id)
    .single()

  if (error || !inf)      return NextResponse.json({ error: 'Инфлуенсърът не е намерен' }, { status: 404 })
  if (!inf.promo_code)    return NextResponse.json({ error: 'Инфлуенсърът няма промокод' }, { status: 400 })
  if (NON_LATIN.test(inf.promo_code)) {
    return NextResponse.json({
      error: `Кодът ${inf.promo_code} съдържа не-латински знак. Първо го поправи в профила на инфлуенсъра.`,
    }, { status: 400 })
  }

  try {
    await createDiscountCode({
      code:          inf.promo_code,
      percentage:    pct,
      collectionIds: collection_id ? [parseInt(collection_id)] : [],
      title:         `Influencer ${inf.promo_code} — ${inf.name}`,
    })
  } catch (err) {
    const dup = /already exists|has already been taken|taken/i.test(err.message || '')
    return NextResponse.json({
      error: dup
        ? `Кодът ${inf.promo_code} вече съществува в Shopify.`
        : `Грешка от Shopify: ${err.message}`,
    }, { status: dup ? 409 : 500 })
  }

  return NextResponse.json({ ok: true, code: inf.promo_code })
}
