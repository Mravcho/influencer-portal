import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'

const DEMO_USERNAME = 'demo'
const DEMO_PASSWORD = 'demo2026'

// Симулирани продукти (плаусибилни имена, не реални от каталога)
const DEMO_PRODUCTS = [
  { title: 'Whey Protein Vanilla 900g',          price: 49.90 },
  { title: 'BCAA Lemon 300g',                    price: 24.50 },
  { title: 'Креатин Моноhидрат 500g',             price: 19.90 },
  { title: 'Multivitamin Complex',               price: 32.00 },
  { title: 'Omega 3 Premium 90 капс.',            price: 28.50 },
  { title: 'Колагенови стиксове 30бр.',           price: 39.90 },
  { title: 'Pre-Workout Booster Mango 350g',     price: 35.00 },
  { title: 'Магнезий Bisglycinate 90 капс.',      price: 22.40 },
]

const CITIES = ['София', 'Пловдив', 'Варна', 'Бургас', 'Русе', 'Стара Загора']

function randomBetween(min, max) {
  return Math.random() * (max - min) + min
}
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// POST /api/admin/seed-demo → пресъздава demo акаунта (изтрива стария и сипва нови данни)
export async function POST() {
  // 1. Изтриваме стария demo акаунт + всичко свързано
  const { data: existing } = await supabaseAdmin
    .from('influencers')
    .select('id')
    .eq('username', DEMO_USERNAME)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin.from('product_requests').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('payout_requests').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('link_clicks').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('share_links').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('orders').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('influencer_request_products').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('login_sessions').delete().eq('influencer_id', existing.id)
    await supabaseAdmin.from('influencers').delete().eq('id', existing.id)
  }

  // 2. Създаваме demo инфлуенсъра
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const { data: inf, error: infErr } = await supabaseAdmin
    .from('influencers')
    .insert({
      name:                     'Демо Профил',
      username:                 DEMO_USERNAME,
      password_hash:            passwordHash,
      promo_code:               'DEMO5',   // 5% отстъпка за клиента в Shopify
      commission:               10,        // 10% комисионна за инфлуенсъра
      platform:                 'Instagram',
      email:                    'demo@example.com',
      email_notifications:      false,
      active:                   true,
      exclude_from_leaderboard: true,
      profile_url:              'https://www.instagram.com/demo',
      notes:                    'ДЕМО АКАУНТ — за показване на партньори. НЕ изтривай ръчно (пресъздай го през „🎭 Demo акаунт" бутона).',
    })
    .select()
    .single()

  if (infErr) return NextResponse.json({ error: infErr.message }, { status: 500 })

  // 3. Default share link (short_code = промокода lowercase)
  await supabaseAdmin
    .from('share_links')
    .insert({
      influencer_id: inf.id,
      short_code:    'demo5',
      target_url:    'https://realfood.bg/discount/DEMO5',
      label:         'Кратък линк за споделяне в соц. мрежи',
      is_default:    true,
    })

  const { data: shareLink } = await supabaseAdmin
    .from('share_links')
    .select('id')
    .eq('influencer_id', inf.id)
    .eq('is_default', true)
    .single()

  // 4. ~25 fake поръчки разпределени през последните 60 дни (с акцент върху текущия месец)
  const orders = []
  const now = new Date()
  for (let i = 0; i < 25; i++) {
    // Половината през последните 30 дни (за нагледен графа за месеца)
    const maxDays = i < 12 ? 30 : 60
    const daysAgo = Math.floor(Math.random() * maxDays)
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0)

    // 1-3 продукта на поръчка
    const numItems = 1 + Math.floor(Math.random() * 3)
    const items = []
    let revenue = 0
    let savings = 0
    for (let j = 0; j < numItems; j++) {
      const p = pickRandom(DEMO_PRODUCTS)
      const qty = 1 + Math.floor(Math.random() * 2)
      const fullPrice = p.price * qty
      const discount  = fullPrice * 0.05 // 5% отстъпка от промокода DEMO5
      revenue += fullPrice
      savings += discount
      items.push({
        title:           p.title,
        variant:         null,
        quantity:        qty,
        price:           p.price,
        discount_amount: Math.round(discount * 100) / 100,
        discounted:      true,
        sku:             'SKU-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
        image_url:       null,
      })
    }
    const shipping  = 5.99
    const totalPaid = Math.round((revenue - savings + shipping) * 100) / 100

    // 90% от поръчките са изпълнени; останалите чакат
    const fulfillmentStatus = i < 22 ? 'fulfilled' : 'unfulfilled'

    orders.push({
      influencer_id:          inf.id,
      shopify_order_id:       9_000_000 + i,
      order_number:           `#10${(1000 + i).toString()}`,
      created_at_shopify:     d.toISOString(),
      total_price:            totalPaid,
      currency:               'EUR',
      financial_status:       'paid',
      fulfillment_status:     fulfillmentStatus,
      line_items:             items,
      commissionable_revenue: Math.round(revenue * 100) / 100,
      total_savings:          Math.round(savings * 100) / 100,
      shipping_total:         shipping,
      customer_name:          `Клиент ${i + 1}`,
      customer_email:         null,
      customer_phone:         null,
      shipping_city:          pickRandom(CITIES),
      synced_at:              new Date().toISOString(),
    })
  }
  await supabaseAdmin.from('orders').insert(orders)

  // Изчисляваме total commission, за да разпределим payout-ите така че да остане
  // позитивен баланс (демо да изглежда здраво за партньори, не „-377.60 €").
  const commissionRate    = 10 // %
  const totalCommissionable = orders.reduce((s, o) => s + Number(o.commissionable_revenue || 0), 0)
  const totalCommission     = totalCommissionable * commissionRate / 100

  // 5. ~80 кликa разпределени през последните 45 дни (повече в делнични дни)
  const clicks = []
  for (let i = 0; i < 80; i++) {
    const daysAgo = Math.floor(Math.random() * 45)
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(Math.floor(randomBetween(9, 22)), Math.floor(Math.random() * 60), 0, 0)
    clicks.push({
      link_id:       shareLink?.id || null,
      influencer_id: inf.id,
      clicked_at:    d.toISOString(),
      ip_address:    `192.0.2.${Math.floor(Math.random() * 254) + 1}`,
      user_agent:    'Mozilla/5.0 (demo)',
      country:       'BG',
      city:          pickRandom(CITIES),
      referrer:      pickRandom([
        'https://www.instagram.com/',
        'https://www.instagram.com/stories/',
        'https://l.instagram.com/',
        'https://www.facebook.com/',
        'https://www.tiktok.com/',
        null,
      ]),
    })
  }
  await supabaseAdmin.from('link_clicks').insert(clicks)

  // 6. Payout заявки — разпределени така че да консумират ~60% от commission-а.
  // Останалите ~40% са „налично за теглене", за да изглежда здраво в demo-то.
  // Минимум payout-и: 100, 80, 60 EUR (ако commission е малък).
  const payoutBudget = totalCommission * 0.6
  const p1 = Math.max(100, Math.round(payoutBudget * 0.40 * 100) / 100) // най-голям, преди 55 дни
  const p2 = Math.max(80,  Math.round(payoutBudget * 0.35 * 100) / 100) // среден, преди 28 дни
  const p3 = Math.max(60,  Math.round(payoutBudget * 0.25 * 100) / 100) // pending, преди 2 дни

  const payouts = [
    {
      influencer_id:        inf.id,
      amount:               p1,
      status:               'paid',
      requested_at:         new Date(now.getTime() - 55 * 86400000).toISOString(),
      processed_at:         new Date(now.getTime() - 50 * 86400000).toISOString(),
      notes:                'IBAN: BG00DEMO00000000000000',
      admin_notes:          'Изплатено по банков път.',
    },
    {
      influencer_id:        inf.id,
      amount:               p2,
      status:               'paid',
      requested_at:         new Date(now.getTime() - 28 * 86400000).toISOString(),
      processed_at:         new Date(now.getTime() - 24 * 86400000).toISOString(),
      notes:                null,
      admin_notes:          'Изплатено.',
    },
    {
      influencer_id:        inf.id,
      amount:               p3,
      status:               'pending',
      requested_at:         new Date(now.getTime() - 2 * 86400000).toISOString(),
      processed_at:         null,
      notes:                'IBAN: BG00DEMO00000000000000',
      admin_notes:          null,
    },
  ]
  await supabaseAdmin.from('payout_requests').insert(payouts)

  // 7. Заявки за продукти — взимаме произволни глобални продукти ако има
  const { data: catalog } = await supabaseAdmin
    .from('request_products')
    .select('id, name, paid_discount_pct, price, request_interval_days')
    .eq('active', true)
    .eq('is_global', true)
    .limit(3)

  if (catalog && catalog.length > 0) {
    const productRequests = catalog.slice(0, 2).map((p, idx) => {
      const isFulfilled = idx === 0
      const requestedAt = new Date(now.getTime() - (isFulfilled ? 40 : 4) * 86400000)
      return {
        influencer_id:      inf.id,
        request_product_id: p.id,
        quantity:           idx === 0 ? 2 : 1,
        free_quantity:      1,
        paid_quantity:      idx === 0 ? 1 : 0,
        paid_total:         idx === 0 ? Math.round(Number(p.price) * (1 - Number(p.paid_discount_pct) / 100) * 100) / 100 : 0,
        status:             isFulfilled ? 'fulfilled' : 'pending',
        requested_at:       requestedAt.toISOString(),
        fulfilled_at:       isFulfilled ? new Date(requestedAt.getTime() + 5 * 86400000).toISOString() : null,
        shipping_method:    'econt_office',
        shipping_recipient: 'Демо Профил',
        shipping_phone:     '+359 88 000 0000',
        shipping_location:  'София, Еконт офис Младост 1',
      }
    })
    await supabaseAdmin.from('product_requests').insert(productRequests)
  }

  return NextResponse.json({
    ok: true,
    credentials: {
      username:    DEMO_USERNAME,
      password:    DEMO_PASSWORD,
      promo_code:  'DEMO5',
      login_url:   '/login',
    },
    stats: {
      orders:           orders.length,
      clicks:           clicks.length,
      payouts:          payouts.length,
      product_requests: catalog ? Math.min(catalog.length, 2) : 0,
    },
  })
}
