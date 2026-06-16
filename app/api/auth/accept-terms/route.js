import { NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/auth/accept-terms — текущият инфлуенсър приема общите условия.
export async function POST() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload || payload.role !== 'influencer' || !payload.id) {
    return NextResponse.json({ error: 'Невалидна сесия' }, { status: 401 })
  }

  const { error } = await supabaseAdmin
    .from('influencers')
    .update({ terms_accepted_at: new Date().toISOString() })
    .eq('id', payload.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
