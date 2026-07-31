import { supabaseAdmin } from '@/lib/supabase'
import { isBot } from '@/lib/share-links'

export const dynamic = 'force-dynamic'

// Public click beacon for the storefront UTM tracker (fires on any realfood.bg
// landing that carries ?_ref=<alias>). Records one click for that link.
function corsHeaders(request) {
  const origin = request.headers.get('origin') || ''
  const allowed =
    /(^|\.)realfood\.bg$/.test(safeHost(origin)) ||
    origin.endsWith('.myshopify.com') ||
    origin.endsWith('.shopify.com')
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://realfood.bg',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}
function safeHost(origin) { try { return new URL(origin).host } catch { return '' } }

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}

export async function POST(request) {
  const headers = { ...corsHeaders(request), 'Content-Type': 'application/json' }
  try {
    const { alias } = JSON.parse(await request.text())
    if (!alias || typeof alias !== 'string') {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers })
    }
    if (isBot(request.headers.get('user-agent') || '')) {
      return new Response(JSON.stringify({ ok: true, bot: true }), { status: 200, headers })
    }
    // RPC is a no-op if the alias doesn't exist (IF FOUND guard), so unknown refs are safe.
    await supabaseAdmin.rpc('record_utm_click', { p_alias: alias.toLowerCase() })
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers })
  }
}
