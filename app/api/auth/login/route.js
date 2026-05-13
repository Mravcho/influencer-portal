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
    // Vercel автоматично добавя geo headers на Edge
    country:    request.headers.get('x-vercel-ip-country') || null,
    city:       request.headers.get('x-vercel-ip-city')
                  ? decodeURIComponent(request.headers.get('x-vercel-ip-city'))
                  : null,
  }
}

export async function POST(request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })
  }

  // Admin (без session tracking за admin)
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

  // Инфлуенсър
  const { data: influencer, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, password_hash, promo_code, commission, platform, active')
    .eq('username', username.toLowerCase())
    .single()

  if (error || !influencer) {
    return NextResponse.json({ error: 'Грешно потребителско име или парола' }, { status: 401 })
  }
  if (!influencer.active) {
    return NextResponse.json({ error: 'Акаунтът е деактивиран' }, { status: 403 })
  }

  const valid = await bcrypt.compare(password, influencer.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Грешно потребителско име или парола' }, { status: 401 })
  }

  // Създаваме session row за tracking
  const clientInfo = extractClientInfo(request)
  const { data: session } = await supabaseAdmin
    .from('login_sessions')
    .insert({ influencer_id: influencer.id, ...clientInfo })
    .select('id')
    .single()

  const token = await signToken({
    id:         influencer.id,
    role:       'influencer',
    username:   influencer.username,
    name:       influencer.name,
    promoCode:  influencer.promo_code,
    commission: influencer.commission,
    sessionId:  session?.id || null,
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
