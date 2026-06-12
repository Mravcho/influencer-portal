import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/email'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// POST /api/auth/request-reset { username | email } → праща мейл с линк
export async function POST(request) {
  const { identifier } = await request.json()
  if (!identifier) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })

  const ident = String(identifier).toLowerCase().trim()

  // 1) Опитваме по username (exact, lowercase)
  let { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, name, email')
    .eq('username', ident)
    .maybeSingle()

  // 2) Ако не намерим и прилича на email → case-insensitive търсене по email
  if (!inf && ident.includes('@')) {
    const r = await supabaseAdmin
      .from('influencers')
      .select('id, name, email')
      .ilike('email', ident)
      .maybeSingle()
    inf = r.data
  }

  // За сигурност винаги връщаме ok (за да не разкриваме кой акаунт съществува)
  if (!inf || !inf.email) {
    console.log(`request-reset: identifier="${ident}" → no match (or no email on file)`)
    return NextResponse.json({ ok: true })
  }

  // Token валиден 1 час
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from('password_reset_tokens')
    .insert({ influencer_id: inf.id, expires_at: expiresAt })
    .select('token')
    .single()

  if (tokenErr) {
    console.error('request-reset: token insert failed:', tokenErr.message)
    return NextResponse.json({ ok: true })
  }

  if (tokenRow?.token) {
    const resetUrl = `${PORTAL_URL}/reset-password?token=${tokenRow.token}`
    try {
      await sendPasswordResetEmail({ to: inf.email, name: inf.name, resetUrl })
      console.log(`request-reset: email sent to ${inf.email}`)
    } catch (err) {
      console.error(`request-reset: email send failed to ${inf.email}:`, err.message)
    }
  }

  return NextResponse.json({ ok: true })
}
