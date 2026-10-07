import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendApplicationEmail } from '@/lib/email'
import { getAdminNotifyEmails } from '@/lib/notify-emails'

// Списък с админи, които получават известия за нови заявки за инфлуенсър.
const PORTAL_URL  = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// POST /api/auth/apply — публичен endpoint за кандидатстване
export async function POST(request) {
  const body = await request.json()
  const {
    full_name, email, phone,
    instagram_url, tiktok_url, facebook_url, youtube_url, other_url,
    motivation, terms_accepted, website,
  } = body

  // Капан за ботове: скритото поле е попълнено → правим се, че е прието
  if (website) return NextResponse.json({ ok: true })

  // Разумни дължини — да не може да се напълни базата/мейла с мегабайти текст
  const tooLong = [[full_name, 120], [email, 200], [phone, 40], [instagram_url, 300], [tiktok_url, 300],
    [facebook_url, 300], [youtube_url, 300], [other_url, 300], [motivation, 3000]]
    .some(([v, max]) => typeof v === 'string' && v.length > max)
  if (tooLong) return NextResponse.json({ error: 'Невалидна заявка' }, { status: 400 })

  if (!full_name || !email || !phone) {
    return NextResponse.json({ error: 'Имена, имейл и телефон са задължителни' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Невалиден имейл адрес' }, { status: 400 })
  }
  if (!instagram_url && !tiktok_url && !facebook_url && !youtube_url && !other_url) {
    return NextResponse.json({ error: 'Поне един линк към соц. мрежа е задължителен' }, { status: 400 })
  }

  // Ако има качени общи условия — приемането им е задължително.
  const { data: branding } = await supabaseAdmin
    .from('branding')
    .select('terms_url')
    .eq('id', 1)
    .maybeSingle()
  if (branding?.terms_url && !terms_accepted) {
    return NextResponse.json({ error: 'Трябва да приемете Общите условия' }, { status: 400 })
  }

  // Защита от наводняване: един и същ имейл — веднъж на 24 ч; общо до 30 заявки на час
  const dayAgo  = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
  const [{ count: sameEmail }, { count: lastHour }] = await Promise.all([
    supabaseAdmin.from('influencer_applications').select('id', { count: 'exact', head: true })
      .eq('email', String(email).trim().toLowerCase()).gte('created_at', dayAgo),
    supabaseAdmin.from('influencer_applications').select('id', { count: 'exact', head: true })
      .gte('created_at', hourAgo),
  ])
  if ((sameEmail || 0) > 0) return NextResponse.json({ ok: true }) // вече е подадена — без дубликат и без мейл
  if ((lastHour || 0) >= 30) {
    return NextResponse.json({ error: 'Твърде много заявки в момента. Опитай отново след малко.' }, { status: 429 })
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
      terms_accepted:    !!terms_accepted,
      terms_accepted_at: terms_accepted ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Уведомяваме admin (fire-and-forget — не блокираме отговора)
  sendApplicationEmail({
    to:             await getAdminNotifyEmails(),
    adminPortalUrl: PORTAL_URL,
    application:    data,
  }).catch(err => console.error('Application email failed:', err.message))

  return NextResponse.json({ ok: true })
}
