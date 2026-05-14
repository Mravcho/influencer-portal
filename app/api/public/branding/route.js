import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/public/branding → публично достъпни branding URLs (за login страницата)
export async function GET() {
  const { data } = await supabaseAdmin
    .from('branding')
    .select('logo_url, login_bg_url, default_banner_url')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json(data || { logo_url: null, login_bg_url: null, default_banner_url: null })
}
