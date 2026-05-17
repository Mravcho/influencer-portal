import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET ?influencer_id=... → връща списък с request_product_id, които са изрично дадени на този инфлуенсър
// (т.е. non-global продукти, видими лично за него)
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const influencerId = searchParams.get('influencer_id')
  if (!influencerId) return NextResponse.json({ error: 'Липсва influencer_id' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('influencer_request_products')
    .select('request_product_id')
    .eq('influencer_id', influencerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data || []).map(r => r.request_product_id))
}

// POST { influencer_id, request_product_id } → дава достъп на конкретен инфлуенсър до non-global продукт
export async function POST(request) {
  const { influencer_id, request_product_id } = await request.json()
  if (!influencer_id || !request_product_id) {
    return NextResponse.json({ error: 'Липсват полета' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('influencer_request_products')
    .insert({ influencer_id, request_product_id })

  if (error && error.code !== '23505') { // 23505 = duplicate (вече присвоен) — ок
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

// DELETE ?influencer_id=...&request_product_id=... → отнема индивидуалния достъп
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const influencerId      = searchParams.get('influencer_id')
  const requestProductId  = searchParams.get('request_product_id')
  if (!influencerId || !requestProductId) {
    return NextResponse.json({ error: 'Липсват параметри' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('influencer_request_products')
    .delete()
    .eq('influencer_id', influencerId)
    .eq('request_product_id', requestProductId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
