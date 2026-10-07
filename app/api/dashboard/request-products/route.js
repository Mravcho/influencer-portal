import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendProductRequestEmail } from '@/lib/email'
import { getAdminNotifyEmails } from '@/lib/notify-emails'
import { productPaymentSupported, partialPaymentSupported, influencerDiscountPct } from '@/lib/product-payment'
import { calcAvailable } from '@/lib/payout-balance'
import { buildMiddlewareShipping } from '@/lib/courier-offices'
import { fetchAllRows } from '@/lib/order-status'

export const dynamic = 'force-dynamic'

// Списък с админи, които получават известия за нови заявки за продукт.
const PORTAL_URL  = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// Праг клика за отключване на втори+ безплатен продукт
const CLICK_THRESHOLD = 200

// Гейт за безплатни продукти СЛЕД първия: първият безплатен продукт е ОК винаги,
// но за втори+ безплатен инфлуенсърът трябва да е доказал трафик/резултат —
// поне 1 поръчка ИЛИ поне CLICK_THRESHOLD клика на линка си. Иначе безплатното
// е заключено (може само платено с отстъпка).
async function computeFreeGate(influencerId) {
  const { count: priorFree } = await supabaseAdmin
    .from('product_requests')
    .select('id', { count: 'exact', head: true })
    .eq('influencer_id', influencerId)
    .neq('status', 'cancelled')
    .gt('free_quantity', 0)

  // Първи безплатен продукт — винаги позволен
  if ((priorFree || 0) === 0) {
    return { eligible: true, isFirst: true, ordersCount: 0, clicksCount: 0, threshold: CLICK_THRESHOLD }
  }

  // Поръчки: само реални (без анулирани/върнати). Кликове: уникални посетители —
  // един IP се брои веднъж на ден, иначе гейтът се отключва с 200 презареждания.
  const [ordersRes, clickRows] = await Promise.all([
    supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
      .eq('influencer_id', influencerId)
      .not('financial_status', 'in', '(voided,refunded)'),
    fetchAllRows((from, to) => supabaseAdmin.from('link_clicks')
      .select('ip_address, clicked_at')
      .eq('influencer_id', influencerId)
      .not('ip_address', 'is', null)
      .range(from, to)),
  ])
  const clicksRes = { count: new Set(clickRows.map(c => `${c.ip_address}|${String(c.clicked_at).slice(0, 10)}`)).size }
  const ordersCount = ordersRes.count || 0
  const clicksCount = clicksRes.count || 0
  const eligible = ordersCount >= 1 || clicksCount >= CLICK_THRESHOLD
  return { eligible, isFirst: false, ordersCount, clicksCount, threshold: CLICK_THRESHOLD }
}

// GET → списък с продукти достъпни за този инфлуенсър + cooldown info за всеки
export async function GET(request) {
  // Admin, който гледа профил на инфлуенсър (?viewId=), заявява от негово име
  const userRole = request.headers.get('x-user-role')
  const viewId   = new URL(request.url).searchParams.get('viewId')
  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  // Админ toggle „Безплатни продукти“: изключен → заявява само платено, с отстъпката
  // от каталога (напр. козметици/партньори). Заявките като такива остават достъпни.
  const { data: me } = await supabaseAdmin
    .from('influencers').select('can_request_products').eq('id', influencerId).single()
  const freeDisabled = me?.can_request_products === false

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

  // Индивидуалната отстъпка на инфлуенсъра (ако е зададена) замества тази от каталога
  const myPct = await influencerDiscountPct(influencerId)
  const allProducts = [...(globalProducts || []), ...individualProducts]
    .map(p => (myPct === null ? p : { ...p, paid_discount_pct: myPct }))
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

  // Гейт за втори+ безплатен продукт (нужна поръчка или трафик)
  const gate = await computeFreeGate(influencerId)

  // Pre-fill за shipping формата: последно използваните стойности от инфлуенсъра
  const { data: shippingDefaults } = await supabaseAdmin
    .from('influencers')
    .select('last_shipping_method, last_shipping_recipient, last_shipping_phone, last_shipping_location, name')
    .eq('id', influencerId)
    .single()

  return NextResponse.json({
    can_request:            true,
    free_disabled:          freeDisabled,
    free_locked_until:      freeDisabled ? null : freeLockedUntil,
    free_days_remaining:    freeLockedDays,
    free_locked_from_name:  freeLockedFromName,
    free_gate: {
      eligible:        gate.eligible,
      is_first:        gate.isFirst,
      orders_count:    gate.ordersCount,
      clicks_count:    gate.clicksCount,
      click_threshold: gate.threshold,
    },
    products: allProducts,
    // Може ли платената част да се плати с изкараната комисионна + колко има налично
    commission_payment: await productPaymentSupported()
      ? { supported: true, partial: await partialPaymentSupported(), available: (await calcAvailable(influencerId)).available }
      : { supported: false, available: 0 },
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
  // Admin, който гледа профил на инфлуенсър (?viewId=), заявява от негово име
  const userRole = request.headers.get('x-user-role')
  const viewId   = new URL(request.url).searchParams.get('viewId')
  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  // Админ toggle „Безплатни продукти“: изключен → само платено, с отстъпка
  const { data: me } = await supabaseAdmin
    .from('influencers').select('can_request_products').eq('id', influencerId).single()
  const freeDisabled = me?.can_request_products === false

  const { product_id, quantity, shipping, payment_method } = await request.json()
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

  // Офисът трябва да е избран от списъка на куриера (същия като в количката на
  // магазина), а адресът — с град, който куриерът познава. Така поръчката минава
  // през middleware-а без ръчни корекции.
  try {
    const mw = await buildMiddlewareShipping(shipping.method, location)
    if (!mw.ok) {
      return NextResponse.json({
        error: mw.error === 'city_not_found'
          ? 'Не разпознах града в адреса. Напиши го така: град, пощенски код, улица, №.'
          : 'Избери офис/автомат от списъка.',
      }, { status: 400 })
    }
  } catch (err) {
    // Списъците на middleware-а са недостъпни → приемаме заявката, админът ще потвърди офиса
    console.error('middleware office check failed:', err.message)
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
  let freeAllowed = !freeDisabled
  if (freeAllowed && product.free_quantity > 0) {
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

    // Гейт: втори+ безплатен продукт изисква поне 1 поръчка или CLICK_THRESHOLD клика
    if (freeAllowed) {
      const gate = await computeFreeGate(influencerId)
      if (!gate.eligible) freeAllowed = false
    }
  }

  // Изчисляваме безплатно / платено
  const freeQty   = freeAllowed ? Math.min(qty, product.free_quantity) : 0
  const paidQty   = qty - freeQty
  const myPct     = await influencerDiscountPct(influencerId)
  const discount  = myPct === null ? Number(product.paid_discount_pct) : myPct
  const unitPaid  = Number(product.price) * (1 - discount / 100)
  const paidTotal = Math.round(paidQty * unitPaid * 100) / 100

  // Плащане с изкараната комисионна. Ако не стига — взимаме наличното, а остатъкът
  // се плаща при получаване (наложен платеж).
  let payWithCommission = payment_method === 'commission' && paidTotal > 0 && await productPaymentSupported()
  let fromCommission = 0
  if (payWithCommission) {
    const available = Math.max(0, (await calcAvailable(influencerId)).available)
    const partial = await partialPaymentSupported()
    if (available <= 0.005) {
      payWithCommission = false
    } else if (paidTotal > available + 0.005 && !partial) {
      return NextResponse.json({
        error: `Наличната комисионна (${available.toFixed(2)} €) не стига за ${paidTotal.toFixed(2)} €. Избери „Плащам сам“ или намали количеството.`,
      }, { status: 400 })
    }
    fromCommission = payWithCommission ? Math.round(Math.min(available, paidTotal) * 100) / 100 : 0
  }

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
      ...(await productPaymentSupported() ? { payment_method: payWithCommission ? 'commission' : 'self' } : {}),
      ...(payWithCommission && await partialPaymentSupported() ? { paid_from_commission: fromCommission } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Защита от двойно харчене: две едновременни заявки виждат един и същ баланс.
  // След записа проверяваме отново — ако сме на минус, отменяме тази заявка.
  if (payWithCommission && (await calcAvailable(influencerId)).available < -0.005) {
    await supabaseAdmin.from('product_requests').delete().eq('id', data.id)
    return NextResponse.json({ error: 'Балансът се промени междувременно (друга заявка). Опитай отново.' }, { status: 409 })
  }

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
      to:              await getAdminNotifyEmails(),
      adminPortalUrl:  PORTAL_URL,
      influencerName:  inf.name,
      promoCode:       inf.promo_code,
      productName:     product.name,
      quantity:        qty,
      freeQty,
      paidQty,
      paidTotal,
      paidFromCommission: payWithCommission,
      fromCommission,
    }).catch(err => console.error('Admin product-request email failed:', err.message))
  }

  return NextResponse.json(data, { status: 201 })
}
