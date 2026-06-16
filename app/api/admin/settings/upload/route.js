import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const DOC_TYPES = [
  'application/pdf',
  'application/msword',                                                       // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
]
const MAX_IMAGE_SIZE = 5 * 1024 * 1024  // 5 MB
const MAX_DOC_SIZE   = 20 * 1024 * 1024 // 20 MB

// POST /api/admin/settings/upload
// body: multipart/form-data with `file` field, optional `kind` = 'logo' | 'bg' | 'default-banner' | 'terms'
export async function POST(request) {
  const formData = await request.formData()
  const file = formData.get('file')
  const kind = formData.get('kind') || 'misc'

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Липсва файл' }, { status: 400 })
  }

  const isTerms = kind === 'terms'
  const allowed = isTerms ? DOC_TYPES : IMAGE_TYPES
  const maxSize = isTerms ? MAX_DOC_SIZE : MAX_IMAGE_SIZE

  if (!allowed.includes(file.type)) {
    return NextResponse.json(
      { error: isTerms ? 'Невалиден формат. Само Word (.doc/.docx) или PDF.' : 'Невалиден формат. Само JPG, PNG, WebP, SVG.' },
      { status: 400 },
    )
  }

  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `Файлът е твърде голям (макс ${Math.round(maxSize / (1024 * 1024))} MB)` },
      { status: 400 },
    )
  }

  const ext  = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${kind}/${Date.now()}.${ext}`

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

  return NextResponse.json({ url: publicUrl })
}
