import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { syncInfluencer } from '@/lib/sync'
import { sendWelcomeEmail } from '@/lib/email'
import { orderCommission } from '@/lib/commission'
import { ensureDefaultLink } from '@/lib/share-links'

export const dynamic = 'force-dynamic'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// Първоначалният sync за нов инфлуенсър може да отнеме >10 сек ако има много поръчки
// (тегли продуктови снимки + insert-ва в базата). Vercel Pro поддържа до 60.
export const maxDuration = 60

// GET /api/admin/influencers → списък с всички + stats
export async function GET() {
  const { data: influencers, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, promo_code, commission, platform, active, exclude_from_leaderboard, can_request_products, category, created_at, profile_url, avatar_url, banner_url, email, email_notifications, notes, share_link_target, contract_url, contract_filename, contract_uploaded_at, terms_accepted_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Per-influencer click count за последните 90 дни.
  // Bulk-fetch с .select() се отрязва от Supabase default row limit (1000),
  // а count: 'exact' дава точния брой без limit.
  const clickWindow = new Date()
  clickWindow.setDate(clickWindow.getDate() - 90)
  clickWindow.setHours(0, 0, 0, 0)
  const clickWindowIso = clickWindow.toISOString()

  // Кога последно са обновени общите условия — за да маркираме приемания,
  // които са отпреди текущата версия на файла.
  const { data: branding } = await supabaseAdmin
    .from('branding')
    .select('terms_updated_at')
    .eq('id', 1)
    .maybeSingle()
  const termsUpdatedAt = branding?.terms_updated_at ? new Date(branding.terms_updated_at) : null

  // Добавяме order stats + click count за всеки
  const enriched = await Promise.all(influencers.map(async (inf) => {
    const [ordersRes, clickRes] = await Promise.all([
      supabaseAdmin
        .from('orders')
        .select('total_price, commissionable_revenue, line_items, financial_status, commission_pct')
        .eq('influencer_id', inf.id),
      supabaseAdmin
        .from('link_clicks')
        .select('id', { count: 'exact', head: true })
        .eq('influencer_id', inf.id)
        .gte('clicked_at', clickWindowIso),
    ])

    // Изключваме отказани/рефундирани поръчки от всички тотали
    const activeOrders = (ordersRes.data || []).filter(
      o => o.financial_status !== 'voided' && o.financial_status !== 'refunded'
    )

    const totalRevenue = activeOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0)

    // Комисионната се изчислява от пълната цена на продуктите с отстъпка
    // commissionable за поръчка (stored или fallback от line_items)
    const commissionableOf = (o) => {
      const stored = parseFloat(o.commissionable_revenue)
      if (stored > 0) return stored
      return (o.line_items || []).reduce(
        (si, item) => si + parseFloat(item.price || 0) * (item.quantity || 1), 0
      )
    }
    const totalCommissionable = activeOrders.reduce((s, o) => s + commissionableOf(o), 0)
    // Комисионна per-order: кампанийните носят своя ставка (commission_pct), иначе inf.commission
    const totalCommission = activeOrders.reduce(
      (s, o) => s + orderCommission(o, commissionableOf(o), inf.commission), 0
    )

    const acceptedAt = inf.terms_accepted_at ? new Date(inf.terms_accepted_at) : null

    return {
      ...inf,
      // true → приел е, но след това е качена нова версия на общите условия
      terms_outdated:  !!(acceptedAt && termsUpdatedAt && acceptedAt < termsUpdatedAt),
      orderCount:      activeOrders.length,
      totalRevenue:    Math.round(totalRevenue * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      clickCount:      clickRes.count || 0,
    }
  }))

  return NextResponse.json(enriched)
}

// POST /api/admin/influencers → създаване
export async function POST(request) {
  const body = await request.json()
  const {
    name, username, password, promo_code, commission, platform,
    notes, profile_url, avatar_url, banner_url,
    email, email_notifications, exclude_from_leaderboard,
    can_request_products, category,
    share_link_target, contract_url, contract_filename,
  } = body

  // Промо кодът вече е опционален — за инфлуенсъри без commission setup.
  // Името и username са задължителни.
  if (!name || !username) {
    return NextResponse.json({ error: 'Името и потребителското име са задължителни' }, { status: 400 })
  }
  const promoCodeNorm = promo_code ? promo_code.trim().toUpperCase() : null

  // Ако не е подадена парола — генерираме случайна (инфлуенсърът ще си зададе своя през reset линка)
  const initialPassword = password || crypto.randomBytes(16).toString('hex')
  const password_hash = await bcrypt.hash(initialPassword, 10)

  const { data, error } = await supabaseAdmin
    .from('influencers')
    .insert({
      name,
      username: username.toLowerCase(),
      password_hash,
      promo_code:          promoCodeNorm,
      commission:          commission || 10,
      platform,
      notes:               notes || null,
      profile_url:         profile_url   || null,
      avatar_url:          avatar_url    || null,
      banner_url:          banner_url    || null,
      email:               email ? email.toLowerCase().trim() : null,
      email_notifications: email_notifications !== false,
      exclude_from_leaderboard: exclude_from_leaderboard === true,
      can_request_products: can_request_products !== false,
      category:            category || 'influencers',
      share_link_target:   share_link_target ? share_link_target.trim() : null,
      contract_url:        contract_url        || null,
      contract_filename:   contract_filename   || null,
      contract_uploaded_at: contract_url ? new Date().toISOString() : null,
    })
    .select('id, name, username, promo_code, commission, platform, email, share_link_target')
    .single()

  if (error) {
    const msg = error.code === '23505' ? 'Потребителско име или промокод вече съществува' : error.message
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Auto-create default share link за новия инфлуенсър (бързо — само Supabase insert)
  await ensureDefaultLink(data).catch(err =>
    console.error('Default share link creation failed:', err.message)
  )

  // Welcome email с линк за задаване на парола (валиден 7 дни) — fire-and-forget
  if (data.email) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: tokenRow } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({ influencer_id: data.id, expires_at: expiresAt })
      .select('token')
      .single()

    if (tokenRow?.token) {
      const resetUrl = `${PORTAL_URL}/reset-password?token=${tokenRow.token}`
      sendWelcomeEmail({
        to:        data.email,
        name:      data.name,
        promoCode: data.promo_code,
        resetUrl,
      }).catch(err => console.error('Welcome email failed:', err.message))
    }
  }

  // Първоначален sync на поръчки — fire-and-forget. Не блокираме response-а;
  // бъдещите поръчки идват през Shopify webhook. Ако промокодът е нов, sync-ът
  // обикновено връща 0 поръчки. Ако има исторически — те ще се появят в базата
  // когато sync-ът приключи (Vercel държи функцията жива до response-а).
  syncInfluencer({
    id:                  data.id,
    name:                data.name,
    promo_code:          data.promo_code,
    commission:          data.commission,
    email:               null,
    email_notifications: false,
  }, { sinceOverride: '2026-01-01T00:00:00.000Z' })
    .catch(err => console.error('Initial sync failed:', err.message))

  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/influencers → обновяване
export async function PATCH(request) {
  const body = await request.json()
  const { id, password, send_password_reset, ...rest } = body

  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const updates = { ...rest }
  if (rest.username) updates.username = rest.username.toLowerCase()
  if (rest.promo_code) updates.promo_code = rest.promo_code.toUpperCase()
  if (typeof rest.email === 'string') updates.email = rest.email ? rest.email.toLowerCase().trim() : null
  if (password) updates.password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabaseAdmin
    .from('influencers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Опционално изпращане на welcome мейл с линк за задаване на парола (валиден 7 дни)
  if (send_password_reset && data.email) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: tokenRow } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({ influencer_id: data.id, expires_at: expiresAt })
      .select('token')
      .single()

    if (tokenRow?.token) {
      const resetUrl = `${PORTAL_URL}/reset-password?token=${tokenRow.token}`
      sendWelcomeEmail({
        to:        data.email,
        name:      data.name,
        promoCode: data.promo_code,
        resetUrl,
      }).catch(err => console.error('Welcome email failed:', err.message))
    }
  }

  return NextResponse.json(data)
}

// DELETE /api/admin/influencers?id=uuid
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  // Изрично трием child rows първо, за случаите когато FK CASCADE не е активен
  await supabaseAdmin.from('orders').delete().eq('influencer_id', id)
  await supabaseAdmin.from('login_sessions').delete().eq('influencer_id', id)
  await supabaseAdmin.from('password_reset_tokens').delete().eq('influencer_id', id)
  await supabaseAdmin.from('payout_requests').delete().eq('influencer_id', id)

  const { error } = await supabaseAdmin.from('influencers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
