import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchProductById } from '@/lib/shopify'

// GET → списък с всички продукти в каталога
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('request_products')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST → добавяне на нов продукт.
// Body: { shopify_product_id, request_interval_days, free_quantity, paid_discount_pct, is_global, active }
// Името/цената/снимката се теглят автоматично от Shopify (admin не ги пише).
export async function POST(request) {
  const body = await request.json()
  const {
    shopify_product_id,
    request_interval_days = 30,
    free_quantity = 1,
    paid_discount_pct = 15,
    is_global = true,
    active = true,
  } = body

  if (!shopify_product_id) {
    return NextResponse.json({ error: 'Липсва shopify_product_id' }, { status: 400 })
  }

  // Извличаме данните за продукта от Shopify
  const product = await fetchProductById(String(shopify_product_id).trim())
  if (!product) {
    return NextResponse.json({ error: 'Продуктът не съществува в Shopify (или е скрит)' }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin
    .from('request_products')
    .insert({
      shopify_product_id: product.shopify_product_id,
      shopify_variant_id: product.shopify_variant_id,
      name:               product.name,
      image_url:          product.image_url,
      price:              product.price,
      request_interval_days,
      free_quantity,
      paid_discount_pct,
      is_global,
      active,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH → обновяване на настройки на продукт (интервал/безплатно/отстъпка/global/active)
export async function PATCH(request) {
  const body = await request.json()
  const { id, refresh_from_shopify, ...rest } = body
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const updates = { ...rest, updated_at: new Date().toISOString() }

  // Опционално: refresh на име/цена/снимка от Shopify
  if (refresh_from_shopify) {
    const { data: existing } = await supabaseAdmin
      .from('request_products')
      .select('shopify_product_id')
      .eq('id', id)
      .single()
    if (existing?.shopify_product_id) {
      const fresh = await fetchProductById(existing.shopify_product_id)
      if (fresh) {
        updates.name      = fresh.name
        updates.image_url = fresh.image_url
        updates.price     = fresh.price
        updates.shopify_variant_id = fresh.shopify_variant_id
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('request_products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE → изтриване на продукт от каталога (cascade-ва и историята)
export async function DELETE(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const { error } = await supabaseAdmin.from('request_products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
