import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

// POST /api/admin/settings/upload
// body: multipart/form-data with `file` field, optional `kind` = 'logo' | 'bg'
export async function POST(request) {
  const formData = await request.formData()
  const file = formData.get('file')
  const kind = formData.get('kind') || 'misc'

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Липсва файл' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Невалиден формат. Само JPG, PNG, WebP, SVG.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Файлът е твърде голям (макс 5 MB)' }, { status: 400 })
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
