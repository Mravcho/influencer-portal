import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/email'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// POST { id } → създава password reset token + изпраща линк на инфлуенсъра
export async function POST(request) {
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Липсва id' }, { status: 400 })

  const { data: inf, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, email')
    .eq('id', id)
    .single()

  if (error || !inf) {
    return NextResponse.json({ error: 'Инфлуенсърът не съществува' }, { status: 404 })
  }
  if (!inf.email) {
    return NextResponse.json({ error: 'Инфлуенсърът няма записан имейл' }, { status: 400 })
  }

  // Токен валиден 24 часа (по-дълъг от 1-часовия self-service reset, защото admin-ът го праща ръчно)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from('password_reset_tokens')
    .insert({ influencer_id: inf.id, expires_at: expiresAt })
    .select('token')
    .single()

  if (tokenErr || !tokenRow?.token) {
    return NextResponse.json({ error: 'Не може да се създаде reset токен' }, { status: 500 })
  }

  const resetUrl = `${PORTAL_URL}/reset-password?token=${tokenRow.token}`
  try {
    await sendPasswordResetEmail({ to: inf.email, name: inf.name, resetUrl })
  } catch (err) {
    console.error('Admin password-reset email failed:', err.message)
    return NextResponse.json({ error: `Грешка при изпращане: ${err.message}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, sentTo: inf.email })
}
