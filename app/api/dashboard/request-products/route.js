import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET → списък с продукти достъпни за този инфлуенсър + cooldown info за всеки
export async function GET(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  // 1) Глобални активни продукти
  const { data: globalProducts } = await supabaseAdmin
    .from('request_products')
    .select('*')
    .eq('is_global', true)
    .eq('active', true)

  // 2) Индивидуално присвоени (non-global)
  const { data: assignedRows } = await supabaseAdmin
    .from('influencer_request_products')
    .select('request_product_id')
    .eq('influencer_id', influencerId)

  const assignedIds = (assignedRows || []).map(r => r.request_product_id)
  let individualProducts = []
  if (assignedIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('request_products')
      .select('*')
      .in('id', assignedIds)
      .eq('active', true)
    individualProducts = data || []
  }

  const allProducts = [...(globalProducts || []), ...individualProducts]
  if (allProducts.length === 0) return NextResponse.json([])

  // 3) Последна заявка на този инфлуенсър за всеки от тези продукти (за cooldown)
  const productIds = allProducts.map(p => p.id)
  const { data: lastRequests } = await supabaseAdmin
    .from('product_requests')
    .select('request_product_id, requested_at, status')
    .eq('influencer_id', influencerId)
    .in('request_product_id', productIds)
    .neq('status', 'cancelled')
    .order('requested_at', { ascending: false })

  // Maps product_id → latest non-cancelled request timestamp
  const lastByProduct = {}
  ;(lastRequests || []).forEach(r => {
    if (!lastByProduct[r.request_product_id]) {
      lastByProduct[r.request_product_id] = r.requested_at
    }
  })

  const now = Date.now()
  const enriched = allProducts.map(p => {
    const lastAt = lastByProduct[p.id] ? new Date(lastByProduct[p.id]) : null
    const nextEligibleAt = lastAt
      ? new Date(lastAt.getTime() + p.request_interval_days * 24 * 60 * 60 * 1000)
      : null
    const daysRemaining = nextEligibleAt
      ? Math.max(0, Math.ceil((nextEligibleAt.getTime() - now) / (1000 * 60 * 60 * 24)))
      : 0
    return {
      ...p,
      last_requested_at:  lastAt ? lastAt.toISOString() : null,
      next_eligible_at:   nextEligibleAt ? nextEligibleAt.toISOString() : null,
      days_remaining:     daysRemaining,
      can_request:        !nextEligibleAt || nextEligibleAt.getTime() <= now,
    }
  })

  // Сортирай: най-напред тези, които може да заяви; после по име
  enriched.sort((a, b) => {
    if (a.can_request !== b.can_request) return a.can_request ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json(enriched)
}

// POST { product_id, quantity } → създава заявка ако cooldown позволява
// Връща { id, free_quantity, paid_quantity, paid_total, status }
export async function POST(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const { product_id, quantity } = await request.json()
  const qty = parseInt(quantity)
  if (!product_id || !qty || qty < 1) {
    return NextResponse.json({ error: 'Невалидна заявка' }, { status: 400 })
  }

  // Зареждаме продукта
  const { data: product, error: pErr } = await supabaseAdmin
    .from('request_products')
    .select('*')
    .eq('id', product_id)
    .eq('active', true)
    .single()
  if (pErr || !product) {
    return NextResponse.json({ error: 'Продуктът не съществува или е деактивиран' }, { status: 404 })
  }

  // Проверяваме дали инфлуенсърът има право на този продукт (глобален ИЛИ assigned)
  if (!product.is_global) {
    const { data: assigned } = await supabaseAdmin
      .from('influencer_request_products')
      .select('request_product_id')
      .eq('influencer_id', influencerId)
      .eq('request_product_id', product_id)
      .maybeSingle()
    if (!assigned) {
      return NextResponse.json({ error: 'Нямате достъп до този продукт' }, { status: 403 })
    }
  }

  // Cooldown check — последна неотменена заявка за същия продукт
  const { data: lastReq } = await supabaseAdmin
    .from('product_requests')
    .select('requested_at')
    .eq('influencer_id', influencerId)
    .eq('request_product_id', product_id)
    .neq('status', 'cancelled')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastReq) {
    const lastAt = new Date(lastReq.requested_at).getTime()
    const nextOk = lastAt + product.request_interval_days * 24 * 60 * 60 * 1000
    if (nextOk > Date.now()) {
      const daysLeft = Math.ceil((nextOk - Date.now()) / (1000 * 60 * 60 * 24))
      return NextResponse.json({
        error: `Следваща заявка за този продукт е възможна след ${daysLeft} дни`,
      }, { status: 429 })
    }
  }

  // Изчисляваме безплатно / платено
  const freeQty   = Math.min(qty, product.free_quantity)
  const paidQty   = Math.max(0, qty - freeQty)
  const unitPaid  = Number(product.price) * (1 - Number(product.paid_discount_pct) / 100)
  const paidTotal = Math.round(paidQty * unitPaid * 100) / 100

  // Записваме заявката (Phase 3 ще създаде Shopify Draft Order)
  const { data, error } = await supabaseAdmin
    .from('product_requests')
    .insert({
      influencer_id:      influencerId,
      request_product_id: product_id,
      quantity:           qty,
      free_quantity:      freeQty,
      paid_quantity:      paidQty,
      paid_total:         paidTotal,
      status:             'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
