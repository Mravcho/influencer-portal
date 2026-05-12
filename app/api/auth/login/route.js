import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { signToken, COOKIE_NAME } from '@/lib/auth'

export async function POST(request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })
  }

  // Проверка за admin
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = await signToken({ role: 'admin', username: 'admin' })
    const response = NextResponse.json({ role: 'admin', redirect: '/admin' })
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === 'production',
    })
    return response
  }

  // Търсим инфлуенсъра в Supabase
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

  const token = await signToken({
    id:        influencer.id,
    role:      'influencer',
    username:  influencer.username,
    name:      influencer.name,
    promoCode: influencer.promo_code,
    commission: influencer.commission,
  })

  const response = NextResponse.json({
    role: 'influencer',
    redirect: '/dashboard',
    name: influencer.name,
    promoCode: influencer.promo_code,
  })

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
