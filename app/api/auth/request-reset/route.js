import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/email'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// POST /api/auth/request-reset { username | email } → праща мейл с линк
export async function POST(request) {
  const { identifier } = await request.json()
  if (!identifier) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })

  // Търсим по username или email
  const { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, name, email')
    .or(`username.eq.${identifier.toLowerCase()},email.eq.${identifier.toLowerCase()}`)
    .maybeSingle()

  // За сигурност винаги връщаме ok (за да не разкриваме кой акаунт съществува)
  if (!inf || !inf.email) {
    return NextResponse.json({ ok: true })
  }

  // Token валиден 1 час
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const { data: tokenRow } = await supabaseAdmin
    .from('password_reset_tokens')
    .insert({ influencer_id: inf.id, expires_at: expiresAt })
    .select('token')
    .single()

  if (tokenRow?.token) {
    const resetUrl = `${PORTAL_URL}/reset-password?token=${tokenRow.token}`
    try {
      await sendPasswordResetEmail({ to: inf.email, name: inf.name, resetUrl })
    } catch (err) {
      console.error('Reset email error:', err.message)
    }
  }

  return NextResponse.json({ ok: true })
}
