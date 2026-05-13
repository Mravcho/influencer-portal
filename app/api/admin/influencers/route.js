import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { syncInfluencer } from '@/lib/sync'

// GET /api/admin/influencers → списък с всички + stats
export async function GET() {
  const { data: influencers, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, promo_code, commission, platform, active, created_at, profile_url, avatar_url, banner_url, email, email_notifications, notes')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Добавяме order stats за всеки
  const enriched = await Promise.all(influencers.map(async (inf) => {
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('total_price, commissionable_revenue, line_items, financial_status')
      .eq('influencer_id', inf.id)

    // Изключваме отказани/рефундирани поръчки от всички тотали
    const activeOrders = (orders || []).filter(
      o => o.financial_status !== 'voided' && o.financial_status !== 'refunded'
    )

    const totalRevenue = activeOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0)

    // Комисионната се изчислява от пълната цена на продуктите с отстъпка
    const totalCommissionable = activeOrders.reduce((s, o) => {
      const stored = parseFloat(o.commissionable_revenue)
      if (stored > 0) return s + stored
      // Fallback за стари поръчки без stored commissionable_revenue
      return s + (o.line_items || []).reduce(
        (si, item) => si + parseFloat(item.price || 0) * (item.quantity || 1), 0
      )
    }, 0)

    return {
      ...inf,
      orderCount:      activeOrders.length,
      totalRevenue:    Math.round(totalRevenue * 100) / 100,
      totalCommission: Math.round(totalCommissionable * inf.commission / 100 * 100) / 100,
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
    email, email_notifications,
  } = body

  if (!name || !username || !password || !promo_code) {
    return NextResponse.json({ error: 'Липсват задължителни полета' }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabaseAdmin
    .from('influencers')
    .insert({
      name,
      username: username.toLowerCase(),
      password_hash,
      promo_code: promo_code.toUpperCase(),
      commission: commission || 10,
      platform,
      notes,
      profile_url:         profile_url   || null,
      avatar_url:          avatar_url    || null,
      banner_url:          banner_url    || null,
      email:               email         || null,
      email_notifications: email_notifications !== false,
    })
    .select('id, name, username, promo_code, commission, platform, email')
    .single()

  if (error) {
    const msg = error.code === '23505' ? 'Потребителско име или промокод вече съществува' : error.message
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Първоначален sync на поръчки от началото на годината — fire-and-forget
  // (Vercel ще го изпълни до края на serverless invocation-а)
  syncInfluencer({
    id:                  data.id,
    name:                data.name,
    promo_code:          data.promo_code,
    commission:          data.commission,
    email:               data.email,
    email_notifications: email_notifications !== false,
  }, { sinceOverride: '2026-01-01T00:00:00.000Z' })
    .catch(err => console.error('Initial sync failed:', err))

  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/influencers → обновяване
export async function PATCH(request) {
  const body = await request.json()
  const { id, password, ...rest } = body

  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const updates = { ...rest }
  if (rest.username) updates.username = rest.username.toLowerCase()
  if (rest.promo_code) updates.promo_code = rest.promo_code.toUpperCase()
  if (password) updates.password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabaseAdmin
    .from('influencers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/admin/influencers?id=uuid
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('influencers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
