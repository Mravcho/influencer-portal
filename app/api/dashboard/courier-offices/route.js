import { NextResponse } from 'next/server'
import { searchOffices } from '@/lib/courier-offices'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/courier-offices?method=speedy_office&q=борово
// Офиси/автомати от списъците на middleware.bg — за падащото меню в заявката за продукт
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const method = searchParams.get('method') || ''
  const q = (searchParams.get('q') || '').slice(0, 80)
  if (q.trim().length < 2) return NextResponse.json({ offices: [] })
  try {
    return NextResponse.json({ offices: await searchOffices(method, q, 30) })
  } catch (err) {
    console.error('courier offices search failed:', err.message)
    return NextResponse.json({ error: 'Списъкът с офиси временно не е достъпен. Опитай след малко.' }, { status: 502 })
  }
}
