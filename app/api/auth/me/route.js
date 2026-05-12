import { NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({}, { status: 401 })

  const payload = await verifyToken(token)
  if (!payload) return NextResponse.json({}, { status: 401 })

  return NextResponse.json({
    name:       payload.name || '',
    username:   payload.username || '',
    promoCode:  payload.promoCode || '',
    commission: payload.commission || 0,
    role:       payload.role,
  })
}
