import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/influencers → списък с всички + stats
export async function GET() {
  const { data: influencers, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, promo_code, commission, platform, active, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Добавяме order stats за всеки
  const enriched = await Promise.all(influencers.map(async (inf) => {
    const { data: stats } = await supabaseAdmin
      .from('orders')
      .select('total_price')
      .eq('influencer_id', inf.id)

    const totalRevenue = (stats || []).reduce((s, o) => s + parseFloat(o.total_price), 0)
    return {
      ...inf,
      orderCount:   (stats || []).length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCommission: Math.round(totalRevenue * inf.commission / 100 * 100) / 100,
    }
  }))

  return NextResponse.json(enriched)
}

// POST /api/admin/influencers → създаване
export async function POST(request) {
  const body = await request.json()
  const { name, username, password, promo_code, commission, platform, notes } = body

  if (!name || !username || !password || !promo_code) {
    return NextResponse.json({ error: 'Липсват задължителни полета' }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 10)

  const { data, error } = await supabaseAdmin
    .from('influencers')
    .insert({ name, username: username.toLowerCase(), password_hash, promo_code: promo_code.toUpperCase(), commission: commission || 10, platform, notes })
    .select('id, name, username, promo_code, commission, platform')
    .single()

  if (error) {
    const msg = error.code === '23505' ? 'Потребителско име или промокод вече съществува' : error.message
    return NextResponse.json({ error: msg }, { status: 409 })
  }

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
