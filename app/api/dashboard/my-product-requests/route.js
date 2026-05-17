import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET → история на заявките за текущия инфлуенсър (всички статуси)
export async function GET(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('product_requests')
    .select(`
      id, quantity, free_quantity, paid_quantity, paid_total,
      status, requested_at, fulfilled_at,
      shipping_method, shipping_recipient, shipping_phone, shipping_location,
      product:request_products(id, name, image_url, paid_discount_pct)
    `)
    .eq('influencer_id', influencerId)
    .order('requested_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
