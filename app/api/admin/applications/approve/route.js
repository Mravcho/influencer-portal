import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { syncInfluencer } from '@/lib/sync'
import { createDiscountCode } from '@/lib/shopify'
import { sendWelcomeEmail } from '@/lib/email'
import { ensureDefaultLink } from '@/lib/share-links'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

export const maxDuration = 60

// POST /api/admin/applications/approve
// body: { application_id, promo_code, customer_discount (%), commission (%),
//         platform, collection_id }
// Прави всичко: Shopify discount + influencer record + welcome email + initial sync.
export async function POST(request) {
  const body = await request.json()
  const {
    application_id,
    promo_code,
    customer_discount = 5,
    commission        = 10,
    platform          = 'Instagram',
    collection_id,
  } = body

  if (!application_id || !promo_code) {
    return NextResponse.json({ error: 'application_id и promo_code са задължителни' }, { status: 400 })
  }

  // 1. Намираме заявката
  const { data: app, error: appErr } = await supabaseAdmin
    .from('influencer_applications')
    .select('*')
    .eq('id', application_id)
    .single()

  if (appErr || !app) {
    return NextResponse.json({ error: 'Заявката не е намерена' }, { status: 404 })
  }

  const code = promo_code.toUpperCase().trim()
  const username = code.toLowerCase()

  // 2. Създаваме Shopify discount code
  let shopifyResult
  try {
    shopifyResult = await createDiscountCode({
      code,
      percentage:    parseFloat(customer_discount),
      collectionIds: collection_id ? [parseInt(collection_id)] : [],
      title:         `Influencer ${code} — ${app.full_name}`,
    })
  } catch (err) {
    return NextResponse.json({
      error: `Грешка при създаване на промо код в Shopify: ${err.message}`,
    }, { status: 500 })
  }

  // 3. Подготвяме profile_url от най-релевантния social link
  const profile_url = app.instagram_url || app.tiktok_url || app.facebook_url || app.youtube_url || app.other_url || null

  // 4. Генерираме случайна парола (инфлуенсърът ще си зададе своя през welcome линк)
  const initialPassword = crypto.randomBytes(16).toString('hex')
  const password_hash = await bcrypt.hash(initialPassword, 10)

  // 5. Създаваме инфлуенсъра в нашата база
  const { data: influencer, error: infErr } = await supabaseAdmin
    .from('influencers')
    .insert({
      name:                app.full_name,
      username,
      password_hash,
      promo_code:          code,
      commission:          parseFloat(commission),
      platform,
      profile_url,
      email:               app.email,
      phone:               app.phone,
      email_notifications: true,
      active:              true,
      notes:               `Кандидатствал на ${new Date(app.created_at).toLocaleDateString('bg-BG')}. Мотивация: ${app.motivation || '—'}`,
    })
    .select('*')
    .single()

  if (infErr) {
    return NextResponse.json({
      error: `Промо кодът в Shopify е създаден, но инфлуенсърът не — ${infErr.message}`,
      shopify: shopifyResult,
    }, { status: 500 })
  }

  // 6. Маркираме заявката като одобрена
  await supabaseAdmin
    .from('influencer_applications')
    .update({
      status:      'approved',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', application_id)

  // 7. Default share link + първоначален sync
  await ensureDefaultLink(influencer).catch(err =>
    console.error('Default link failed:', err.message)
  )

  syncInfluencer({
    id:                  influencer.id,
    name:                influencer.name,
    promo_code:          influencer.promo_code,
    commission:          influencer.commission,
    email:               null,
    email_notifications: false,
  }, { sinceOverride: '2026-01-01T00:00:00.000Z' })
    .catch(err => console.error('Initial sync failed:', err))

  // 8. Welcome email с линк за задаване на парола
  if (influencer.email) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: tokenRow } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({ influencer_id: influencer.id, expires_at: expiresAt })
      .select('token')
      .single()

    if (tokenRow?.token) {
      const resetUrl = `${PORTAL_URL}/reset-password?token=${tokenRow.token}`
      sendWelcomeEmail({
        to:        influencer.email,
        name:      influencer.name,
        promoCode: influencer.promo_code,
        resetUrl,
      }).catch(err => console.error('Welcome email failed:', err.message))
    }
  }

  return NextResponse.json({
    ok:         true,
    influencer,
    shopify:    shopifyResult,
  })
}
