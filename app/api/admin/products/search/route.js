import { NextResponse } from 'next/server'
import { searchProducts } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET /api/admin/products/search?q=... → търси Shopify продукти за admin picker-а
export async function GET(request) {
  if (request.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  try {
    const results = await searchProducts(q)
    return NextResponse.json(results)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
