import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { signToken, COOKIE_NAME } from '@/lib/auth'

function extractClientInfo(request) {
  const ip =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  return {
    ip_address: ip,
    user_agent: request.headers.get('user-agent') || null,
    country:    request.headers.get('x-vercel-ip-country') || null,
    city:       request.headers.get('x-vercel-ip-city')
                  ? decodeURIComponent(request.headers.get('x-vercel-ip-city'))
                  : null,
  }
}

// Записва опит за вход (успешен или не)
async function logAttempt({ influencerId, attemptedUsername, success, failureReason, clientInfo }) {
  const { data, error } = await supabaseAdmin
    .from('login_sessions')
    .insert({
      influencer_id:      influencerId,
      attempted_username: attemptedUsername,
      success,
      failure_reason:     failureReason,
      ...clientInfo,
    })
    .select('id')
    .single()
  if (error) console.error('Login attempt log error:', error.message)
  return data?.id || null
}

export async function POST(request) {
  const { username, password } = await request.json()
  const clientInfo = extractClientInfo(request)

  if (!username || !password) {
    return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })
  }

  // Admin (без session tracking)
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = await signToken({ role: 'admin', username: 'admin' })
    const response = NextResponse.json({ role: 'admin', redirect: '/admin' })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  }

  // Инфлуенсър — търсим в базата
  const { data: influencer } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, password_hash, promo_code, commission, platform, active')
    .eq('username', username.toLowerCase())
    .single()

  // Неуспех: няма такъв username
  if (!influencer) {
    await logAttempt({
      influencerId: null,
      attemptedUsername: username,
      success: false,
      failureReason: 'no_such_user',
      clientInfo,
    })
    return NextResponse.json({ error: 'Грешно потребителско име или парола' }, { status: 401 })
  }

  // Неуспех: акаунтът е деактивиран
  if (!influencer.active) {
    await logAttempt({
      influencerId: influencer.id,
      attemptedUsername: username,
      success: false,
      failureReason: 'inactive',
      clientInfo,
    })
    return NextResponse.json({ error: 'Акаунтът е деактивиран' }, { status: 403 })
  }

  // Неуспех: грешна парола
  const valid = await bcrypt.compare(password, influencer.password_hash)
  if (!valid) {
    await logAttempt({
      influencerId: influencer.id,
      attemptedUsername: username,
      success: false,
      failureReason: 'wrong_password',
      clientInfo,
    })
    return NextResponse.json({ error: 'Грешно потребителско име или парола' }, { status: 401 })
  }

  // Успех — записваме нова сесия
  const sessionId = await logAttempt({
    influencerId: influencer.id,
    attemptedUsername: username,
    success: true,
    failureReason: null,
    clientInfo,
  })

  const token = await signToken({
    id:         influencer.id,
    role:       'influencer',
    username:   influencer.username,
    name:       influencer.name,
    promoCode:  influencer.promo_code,
    commission: influencer.commission,
    sessionId,
  })

  const response = NextResponse.json({
    role: 'influencer',
    redirect: '/dashboard',
    name: influencer.name,
    promoCode: influencer.promo_code,
  })

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
