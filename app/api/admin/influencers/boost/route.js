import { NextResponse } from 'next/server'
import { boostSupported, isBoostActive, setBoostActive } from '@/lib/influencer-codes'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

// GET → включен ли е 10% периодът
export async function GET() {
  return NextResponse.json({ supported: await boostSupported(), active: await isBoostActive() })
}

// POST { active } → включва/изключва 10% кодовете на всички в Shopify.
// Изключени: клиентите получават основния (5%) код, а 10% не работи в количката.
export async function POST(request) {
  const { active } = await request.json().catch(() => ({}))
  if (typeof active !== 'boolean') return NextResponse.json({ error: 'Липсва active' }, { status: 400 })
  try {
    const results = await setBoostActive(active)
    return NextResponse.json({ active, results })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
