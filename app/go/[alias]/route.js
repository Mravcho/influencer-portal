import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isBot, SHOP_BASE_URL } from '@/lib/share-links'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SHOP_HOST = (() => { try { return new URL(SHOP_BASE_URL).host.replace(/^www\./, '') } catch { return 'realfood.bg' } })()

// Public short-link redirect: /go/<alias> → 302 to the UTM URL.
// Click counting: the storefront beacon (/api/track) counts every realfood.bg
// landing that carries ?_ref=<alias>. To avoid double-counting, this redirect
// only records the click for EXTERNAL destinations, where the beacon can't fire.
export async function GET(request, { params }) {
  const alias = (params?.alias || '').toLowerCase()
  if (!alias) return NextResponse.redirect(SHOP_BASE_URL, 302)

  const { data: link } = await supabaseAdmin
    .from('utm_links')
    .select('full_url, dest_url, active')
    .eq('alias', alias)
    .maybeSingle()

  if (!link || link.active === false) return NextResponse.redirect(SHOP_BASE_URL, 302)

  let isInternal = true
  try { isInternal = new URL(link.dest_url).host.replace(/^www\./, '') === SHOP_HOST } catch {}

  if (!isInternal && !isBot(request.headers.get('user-agent') || '')) {
    await supabaseAdmin.rpc('record_utm_click', { p_alias: alias })
  }

  return NextResponse.redirect(link.full_url, 302)
}
