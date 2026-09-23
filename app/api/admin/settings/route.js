import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { notifyEmailsColumnExists, getSavedNotifyEmails, normalizeEmails, ENV_EMAILS } from '@/lib/notify-emails'

export const dynamic = 'force-dynamic'

// GET /api/admin/settings → текущи branding настройки
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('branding')
    .select('logo_url, login_bg_url, default_banner_url, terms_url, terms_updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Имейли за известия: записаните (ако има) + дали колоната съществува + env fallback
  const notifySupported = await notifyEmailsColumnExists()
  const saved = notifySupported ? await getSavedNotifyEmails() : null

  return NextResponse.json({
    ...(data || {
      logo_url: null, login_bg_url: null, default_banner_url: null,
      terms_url: null, terms_updated_at: null,
    }),
    notify_emails:           saved || [],
    notify_emails_supported: notifySupported,
    notify_emails_fallback:  ENV_EMAILS,
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

  // Имейли за известия — само ако са подадени и колоната съществува
  if (Array.isArray(body.notify_emails)) {
    if (!(await notifyEmailsColumnExists())) {
      return NextResponse.json({
        error: 'Колоната notify_emails липсва в базата — пусни supabase/migration_notify_emails.sql и опитай пак.',
      }, { status: 400 })
    }
    const bad = body.notify_emails.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()))
    if (bad.length) return NextResponse.json({ error: `Невалиден имейл: ${bad.join(', ')}` }, { status: 400 })
    updates.notify_emails = normalizeEmails(body.notify_emails)
  }

  const { data, error } = await supabaseAdmin
    .from('branding')
    .upsert({ id: 1, ...updates })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
