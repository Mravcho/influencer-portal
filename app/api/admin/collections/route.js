import { NextResponse } from 'next/server'
import { fetchAllCollections } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// GET /api/admin/collections → списък с Shopify колекции (id, title, handle)
export async function GET() {
  try {
    const collections = await fetchAllCollections()
    return NextResponse.json({ collections })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
