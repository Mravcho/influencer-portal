import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]
const MAX_SIZE = 15 * 1024 * 1024 // 15 MB — фактурите често са по-големи от снимки

// POST /api/dashboard/payouts/upload-invoice
// multipart/form-data with `file` field
// Връща { url, filename } — фронтендът ги прикача към POST /api/dashboard/payouts
export async function POST(request) {
  const influencerId = request.headers.get('x-user-id')
  if (!influencerId) return NextResponse.json({ error: 'Не сте логнат' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Липсва файл' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({
      error: 'Невалиден формат. Приемаме PDF, JPG, PNG, WebP.',
    }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({
      error: `Файлът е твърде голям (макс ${Math.round(MAX_SIZE / 1024 / 1024)} MB)`,
    }, { status: 400 })
  }

  const originalName = file.name || 'invoice'
  const ext   = originalName.split('.').pop()?.toLowerCase() || 'pdf'
  // Имената съдържат influencer_id + timestamp + random suffix → unguessable URL
  const rand  = Math.random().toString(36).slice(2, 10)
  const path  = `invoices/${influencerId}/${Date.now()}-${rand}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from('branding')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabaseAdmin
    .storage
    .from('branding')
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl, filename: originalName })
}
