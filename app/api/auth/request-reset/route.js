import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendPasswordResetEmail } from '@/lib/email'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg'

// POST /api/auth/request-reset { username | email } → праща мейл с линк
export async function POST(request) {
  const { identifier } = await request.json()
  if (!identifier) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })

  const ident = String(identifier).toLowerCase().trim()
  console.log(`request-reset: looking up ident="${ident}" (len=${ident.length})`)

  // 1) Опитваме по username (exact, lowercase)
  let { data: inf } = await supabaseAdmin
    .from('influencers')
    .select('id, name, email')
    .eq('username', ident)
    .maybeSingle()

  if (inf) console.log(`request-reset: matched by username → influencer ${inf.id}, email="${inf.email}"`)

  // 2) Ако не намерим и прилича на email → case-insensitive търсене по email
  if (!inf && ident.includes('@')) {
    // Първо опит с .ilike (трябва да работи в нормални случаи)
    const r = await supabaseAdmin
      .from('influencers')
      .select('id, name, email')
      .ilike('email', ident)
      .maybeSingle()
    inf = r.data
    if (inf) console.log(`request-reset: matched by email (ilike) → influencer ${inf.id}, stored email="${inf.email}"`)

    // 3) Fallback: ако ilike не намери (възможно поради whitespace или странни знаци)
    //    → теглим всички и сравняваме в JS с trim().toLowerCase()
    if (!inf) {
      const { data: all } = await supabaseAdmin
        .from('influencers')
        .select('id, name, email')
        .not('email', 'is', null)
      const match = (all || []).find(i =>
        (i.email || '').trim().toLowerCase() === ident
      )
      if (match) {
        inf = match
        console.log(`request-reset: matched by email (JS scan fallback) → influencer ${inf.id}, stored email="${inf.email}" (len=${(inf.email || '').length})`)
      } else {
        console.log(`request-reset: NO email match. Searched against ${(all || []).length} influencer emails.`)
      }
    }
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
