import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendProductRequestEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Списък с админи, които получават известия за нови заявки за продукт.
// Може да се override-не с env var ADMIN_NOTIFY_EMAILS (запетая-разделени).
const ADMIN_EMAILS = (process.env.ADMIN_NOTIFY_EMAILS || 'pavel@realfood.bg,s.zareva@realfood.bg,order@realfood.bg')
  .split(',').map(s => s.trim()).filter(Boolean)
const PORTAL_URL  = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

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
    .sort((a, b) => a.name.localeCompare(b.name))

  // Глобален free lockout: най-скорошната заявка с free_quantity > 0 заключва безплатното
  // за всички продукти, до изтичане на интервала на ТОЗИ продукт.
  const { data: lastFreeReq } = await supabaseAdmin
    .from('product_requests')
    .select('requested_at, request_product:request_products(name, request_interval_days)')
    .eq('influencer_id', influencerId)
    .neq('status', 'cancelled')
    .gt('free_quantity', 0)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let freeLockedUntil = null
  let freeLockedDays  = 0
  let freeLockedFromName = null
  if (lastFreeReq?.request_product?.request_interval_days) {
    const reqAt    = new Date(lastFreeReq.requested_at).getTime()
    const lockedTo = reqAt + lastFreeReq.request_product.request_interval_days * 24 * 60 * 60 * 1000
    if (lockedTo > Date.now()) {
      freeLockedUntil    = new Date(lockedTo).toISOString()
      freeLockedDays     = Math.ceil((lockedTo - Date.now()) / (1000 * 60 * 60 * 24))
      freeLockedFromName = lastFreeReq.request_product.name
    }
  }

  // Pre-fill за shipping формата: последно използваните стойности от инфлуенсъра
  const { data: shippingDefaults } = await supabaseAdmin
    .from('influencers')
    .select('last_shipping_method, last_shipping_recipient, last_shipping_phone, last_shipping_location, name')
    .eq('id', influencerId)
    .single()

  return NextResponse.json({
    free_locked_until:      freeLockedUntil,
    free_days_remaining:    freeLockedDays,
    free_locked_from_name:  freeLockedFromName,
    products: allProducts,
    shipping_defaults: {
      method:    shippingDefaults?.last_shipping_method    || '',
      recipient: shippingDefaults?.last_shipping_recipient || shippingDefaults?.name || '',
      phone:     shippingDefaults?.last_shipping_phone     || '',
      location:  shippingDefaults?.last_shipping_location  || '',
    },
  })
}

// POST { product_id, quantity } → създава заявка ако cooldown позволява
// Връща { id, free_quantity, paid_quantity, paid_total, status }
export async function POST(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const { product_id, quantity, shipping } = await request.json()
  const qty = parseInt(quantity)
  if (!product_id || !qty || qty < 1) {
    return NextResponse.json({ error: 'Невалидна заявка' }, { status: 400 })
  }

  const VALID_METHODS = ['econt_office', 'speedy_office', 'boxnow', 'address']
  if (!shipping || !VALID_METHODS.includes(shipping.method)) {
    return NextResponse.json({ error: 'Избери начин на доставка' }, { status: 400 })
  }
  const recipient = String(shipping.recipient || '').trim()
  const phone     = String(shipping.phone     || '').trim()
  const location  = String(shipping.location  || '').trim()
  if (!recipient || !phone || !location) {
    return NextResponse.json({ error: 'Попълни име, телефон и адрес/офис за доставка' }, { status: 400 })
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

  // Глобален free lockout: ако последната заявка с free_quantity > 0 е още в интервал
  // → безплатното за този инфлуенсър е заключено за ВСИЧКИ продукти.
  // Платените (с -X%) се позволяват винаги — само свеждаме free_quantity до 0.
  let freeAllowed = true
  if (product.free_quantity > 0) {
    const { data: lastFreeReq } = await supabaseAdmin
      .from('product_requests')
      .select('requested_at, request_product:request_products(request_interval_days)')
      .eq('influencer_id', influencerId)
      .neq('status', 'cancelled')
      .gt('free_quantity', 0)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastFreeReq?.request_product?.request_interval_days) {
      const reqAt    = new Date(lastFreeReq.requested_at).getTime()
      const lockedTo = reqAt + lastFreeReq.request_product.request_interval_days * 24 * 60 * 60 * 1000
      if (lockedTo > Date.now()) freeAllowed = false
    }
  }

  // Изчисляваме безплатно / платено
  const freeQty   = freeAllowed ? Math.min(qty, product.free_quantity) : 0
  const paidQty   = qty - freeQty
  const unitPaid  = Number(product.price) * (1 - Number(product.paid_discount_pct) / 100)
  const paidTotal = Math.round(paidQty * unitPaid * 100) / 100

  // Записваме заявката
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
      shipping_method:    shipping.method,
      shipping_recipient: recipient,
      shipping_phone:     phone,
      shipping_location:  location,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Запазваме последно използваните стойности на инфлуенсъра за pre-fill следващия път
  await supabaseAdmin
    .from('influencers')
    .update({
      last_shipping_method:    shipping.method,
      last_shipping_recipient: recipient,
      last_shipping_phone:     phone,
      last_shipping_location:  location,
    })
    .eq('id', influencerId)

  // Известие до admin (fire-and-forget) — не блокираме отговора
  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('name, promo_code')
    .eq('id', influencerId)
    .single()

  if (inf) {
    sendProductRequestEmail({
      to:              ADMIN_EMAILS,
      adminPortalUrl:  PORTAL_URL,
      influencerName:  inf.name,
      promoCode:       inf.promo_code,
      productName:     product.name,
      quantity:        qty,
      freeQty,
      paidQty,
      paidTotal,
    }).catch(err => console.error('Admin product-request email failed:', err.message))
  }

  return NextResponse.json(data, { status: 201 })
}
