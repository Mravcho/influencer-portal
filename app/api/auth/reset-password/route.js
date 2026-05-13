import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/auth/reset-password?token=xxx → проверка дали token-ът е валиден
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ valid: false, error: 'Липсва token' }, { status: 400 })

  const { data } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('token, expires_at, used_at, influencer_id')
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ valid: false, error: 'Невалиден token' }, { status: 404 })
  if (data.used_at) return NextResponse.json({ valid: false, error: 'Token-ът вече е използван' }, { status: 410 })
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ valid: false, error: 'Token-ът е изтекъл' }, { status: 410 })

  return NextResponse.json({ valid: true })
}

// POST /api/auth/reset-password { token, password } → задава нова парола
export async function POST(request) {
  const { token, password } = await request.json()
  if (!token || !password) return NextResponse.json({ error: 'Липсват данни' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Паролата трябва да е минимум 6 символа' }, { status: 400 })

  const { data: row } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('token, expires_at, used_at, influencer_id')
    .eq('token', token)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Невалиден token' }, { status: 404 })
  if (row.used_at) return NextResponse.json({ error: 'Token-ът вече е използван' }, { status: 410 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'Token-ът е изтекъл' }, { status: 410 })

  const password_hash = await bcrypt.hash(password, 10)

  const { error: updateErr } = await supabaseAdmin
    .from('influencers')
    .update({ password_hash })
    .eq('id', row.influencer_id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)

  return NextResponse.json({ ok: true })
}
