import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isBot, SHOP_BASE_URL } from '@/lib/share-links'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Public short-link redirect: /go/<alias> → records a click → 302 to the UTM URL.
export async function GET(request, { params }) {
  const alias = (params?.alias || '').toLowerCase()
  if (!alias) return NextResponse.redirect(SHOP_BASE_URL, 302)

  const { data: link } = await supabaseAdmin
    .from('utm_links')
    .select('full_url, active')
    .eq('alias', alias)
    .maybeSingle()

  if (!link || link.active === false) return NextResponse.redirect(SHOP_BASE_URL, 302)

  // Don't count social/link-preview crawlers — matches the /r/[code] convention.
  if (!isBot(request.headers.get('user-agent') || '')) {
    await supabaseAdmin.rpc('record_utm_click', { p_alias: alias })
  }

  return NextResponse.redirect(link.full_url, 302)
}
