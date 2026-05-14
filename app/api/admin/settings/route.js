import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/settings → текущи branding настройки
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('branding')
    .select('logo_url, login_bg_url, default_banner_url')
    .eq('id', 1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || { logo_url: null, login_bg_url: null, default_banner_url: null })
}

// PATCH /api/admin/settings → обновяване
export async function PATCH(request) {
  const body = await request.json()
  const updates = {
    logo_url:           body.logo_url           ?? null,
    login_bg_url:       body.login_bg_url       ?? null,
    default_banner_url: body.default_banner_url ?? null,
    updated_at:         new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from('branding')
    .upsert({ id: 1, ...updates })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
