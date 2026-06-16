import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/settings → текущи branding настройки
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('branding')
    .select('logo_url, login_bg_url, default_banner_url, terms_url, terms_updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || {
    logo_url: null, login_bg_url: null, default_banner_url: null,
    terms_url: null, terms_updated_at: null,
  })
}

// PATCH /api/admin/settings → обновяване
export async function PATCH(request) {
  const body = await request.json()

  // Текущ terms_url — за да разберем дали е качен НОВ файл (нова версия).
  const { data: current } = await supabaseAdmin
    .from('branding')
    .select('terms_url, terms_updated_at')
    .eq('id', 1)
    .maybeSingle()

  const newTermsUrl = body.terms_url ?? null
  const termsChanged = newTermsUrl !== (current?.terms_url ?? null)

  const updates = {
    logo_url:           body.logo_url           ?? null,
    login_bg_url:       body.login_bg_url       ?? null,
    default_banner_url: body.default_banner_url ?? null,
    terms_url:          newTermsUrl,
    updated_at:         new Date().toISOString(),
  }

  // Нов/сменен файл с общи условия → отбелязваме момента.
  // Това инвалидира всички стари приемания (инфлуенсърите трябва да приемат наново).
  // Премахнат файл (null) → нулираме и timestamp-а.
  if (termsChanged) {
    updates.terms_updated_at = newTermsUrl ? new Date().toISOString() : null
  } else {
    updates.terms_updated_at = current?.terms_updated_at ?? null
  }

  const { data, error } = await supabaseAdmin
    .from('branding')
    .upsert({ id: 1, ...updates })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
