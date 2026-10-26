import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const VOIDED = new Set(['voided', 'refunded'])

// GET /api/admin/influencers/activity?days=30
// Активност на инфлуенсърите за периода: продажби, кликове по линковете и
// влизания в портала + кога за последно е имало всяко от тях.
// Статус: selling (има продажби) | traffic (само кликове) | login (само влиза) | inactive
export async function GET(request) {
  const daysParam = parseInt(new URL(request.url).searchParams.get('days') || '30', 10)
  const days = [7, 30, 60, 90, 180].includes(daysParam) ? daysParam : 30
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const { data: influencers, error } = await supabaseAdmin
    .from('influencers')
    .select('id, name, username, promo_code, avatar_url, category, active, created_at')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = await Promise.all((influencers || []).map(async inf => {
    const [ordersWin, lastOrder, clicksWin, lastClick, loginsWin, lastLogin] = await Promise.all([
      supabaseAdmin.from('orders').select('financial_status').eq('influencer_id', inf.id).gte('created_at_shopify', since),
      supabaseAdmin.from('orders').select('created_at_shopify, financial_status').eq('influencer_id', inf.id)
        .not('financial_status', 'in', '(voided,refunded)')
        .order('created_at_shopify', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('link_clicks').select('id', { count: 'exact', head: true }).eq('influencer_id', inf.id).gte('clicked_at', since),
      supabaseAdmin.from('link_clicks').select('clicked_at').eq('influencer_id', inf.id)
        .order('clicked_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('login_sessions').select('id', { count: 'exact', head: true }).eq('influencer_id', inf.id)
        .eq('success', true).gte('login_at', since),
      supabaseAdmin.from('login_sessions').select('last_seen_at, login_at').eq('influencer_id', inf.id)
        .eq('success', true).order('last_seen_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const orders = (ordersWin.data || []).filter(o => !VOIDED.has(o.financial_status)).length
    const clicks = clicksWin.count || 0
    const logins = loginsWin.count || 0
    const lastOrderAt = lastOrder.data?.created_at_shopify || null
    const lastClickAt = lastClick.data?.clicked_at || null
    const lastLoginAt = lastLogin.data?.last_seen_at || lastLogin.data?.login_at || null
    // Влизане в периода: брои и сесия, започнала по-рано, но активна в периода
    const loggedIn = logins > 0 || (lastLoginAt && lastLoginAt >= since)

    const status = orders > 0 ? 'selling' : clicks > 0 ? 'traffic' : loggedIn ? 'login' : 'inactive'
    const lastActivityAt = [lastOrderAt, lastClickAt, lastLoginAt].filter(Boolean).sort().pop() || null

    return {
      id: inf.id, name: inf.name, username: inf.username, promo_code: inf.promo_code,
      avatar_url: inf.avatar_url, category: inf.category || 'influencers',
      account_active: inf.active !== false, created_at: inf.created_at,
      orders, clicks, logins,
      lastOrderAt, lastClickAt, lastLoginAt, lastActivityAt,
      status,
    }
  }))

  return NextResponse.json({ days, since, rows }, { headers: { 'Cache-Control': 'no-store' } })
}
