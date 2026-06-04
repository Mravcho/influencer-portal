import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

// POST /api/admin/influencers/upload-contract
// multipart/form-data with `file` field
// Връща { url, filename } — admin формата ги прикача към POST/PATCH /api/admin/influencers
export async function POST(request) {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Липсва файл' }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({
      error: 'Невалиден формат. Приемаме PDF, DOC/DOCX, JPG, PNG, WebP.',
    }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({
      error: `Файлът е твърде голям (макс ${Math.round(MAX_SIZE / 1024 / 1024)} MB)`,
    }, { status: 400 })
  }

  const originalName = file.name || 'contract'
  const ext   = originalName.split('.').pop()?.toLowerCase() || 'pdf'
  const rand  = Math.random().toString(36).slice(2, 10)
  const path  = `contracts/${Date.now()}-${rand}.${ext}`
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
