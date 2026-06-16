import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /terms → отдава текущия файл с общи условия под собствения домейн
// (portal.realfood.bg/terms), вместо да излага Supabase storage линка.
// Файлът си остава в Supabase — тук само го препредаваме.
export async function GET() {
  const { data } = await supabaseAdmin
    .from('branding')
    .select('terms_url')
    .eq('id', 1)
    .maybeSingle()

  if (!data?.terms_url) {
    return new NextResponse('Общите условия не са качени още.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const upstream = await fetch(data.terms_url, { cache: 'no-store' })
  if (!upstream.ok) {
    return new NextResponse('Файлът не е намерен.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const ext = (data.terms_url.split('.').pop() || '').toLowerCase().split(/[?#]/)[0]
  const typeByExt = {
    pdf:  'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  const contentType = upstream.headers.get('content-type') || typeByExt[ext] || 'application/octet-stream'
  const filename = `obshti-usloviya.${ext || 'pdf'}`

  const buf = await upstream.arrayBuffer()
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
