import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendApplicationEmail } from '@/lib/email'

// Списък с админи, които получават известия за нови заявки за инфлуенсър.
// Може да се override-не с env var ADMIN_NOTIFY_EMAILS (запетая-разделени).
const ADMIN_EMAILS = (process.env.ADMIN_NOTIFY_EMAILS || 'pavel@realfood.bg,simona.z@realfood.bg,order@realfood.bg')
  .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
const PORTAL_URL  = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// POST /api/auth/apply — публичен endpoint за кандидатстване
export async function POST(request) {
  const body = await request.json()
  const {
    full_name, email, phone,
    instagram_url, tiktok_url, facebook_url, youtube_url, other_url,
    motivation,
  } = body

  if (!full_name || !email || !phone) {
    return NextResponse.json({ error: 'Имена, имейл и телефон са задължителни' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Невалиден имейл адрес' }, { status: 400 })
  }
  if (!instagram_url && !tiktok_url && !facebook_url && !youtube_url && !other_url) {
    return NextResponse.json({ error: 'Поне един линк към соц. мрежа е задължителен' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('influencer_applications')
    .insert({
      full_name:     full_name.trim(),
      email:         email.trim().toLowerCase(),
      phone:         phone?.trim() || null,
      instagram_url: instagram_url?.trim() || null,
      tiktok_url:    tiktok_url?.trim() || null,
      facebook_url:  facebook_url?.trim() || null,
      youtube_url:   youtube_url?.trim() || null,
      other_url:     other_url?.trim() || null,
      motivation:    motivation?.trim() || null,
      status:        'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Уведомяваме admin (fire-and-forget — не блокираме отговора)
  sendApplicationEmail({
    to:             ADMIN_EMAILS,
    adminPortalUrl: PORTAL_URL,
    application:    data,
  }).catch(err => console.error('Application email failed:', err.message))

  return NextResponse.json({ ok: true })
}
