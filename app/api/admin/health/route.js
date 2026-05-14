import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/admin/health → проверява че всички таблици и колони ги има
export async function GET() {
  const checks = []

  // Тестове за всяка таблица + критични колони
  const tests = [
    {
      name: 'influencers (banner_url)',
      check: () => supabaseAdmin.from('influencers').select('id, banner_url').limit(1),
    },
    {
      name: 'orders (commissionable_revenue, total_savings)',
      check: () => supabaseAdmin.from('orders').select('id, commissionable_revenue, total_savings, shipping_total').limit(1),
    },
    {
      name: 'branding',
      check: () => supabaseAdmin.from('branding').select('id, logo_url').limit(1),
    },
    {
      name: 'login_sessions (success, attempted_username)',
      check: () => supabaseAdmin.from('login_sessions').select('id, success, attempted_username, failure_reason').limit(1),
    },
    {
      name: 'password_reset_tokens',
      check: () => supabaseAdmin.from('password_reset_tokens').select('token').limit(1),
    },
    {
      name: 'payout_requests',
      check: () => supabaseAdmin.from('payout_requests').select('id, status, amount').limit(1),
    },
    {
      name: 'share_links',
      check: () => supabaseAdmin.from('share_links').select('id, short_code, target_url').limit(1),
    },
    {
      name: 'link_clicks',
      check: () => supabaseAdmin.from('link_clicks').select('id, clicked_at').limit(1),
    },
  ]

  for (const t of tests) {
    const { error } = await t.check()
    checks.push({
      name: t.name,
      ok:   !error,
      error: error?.message || null,
    })
  }

  const ok = checks.every(c => c.ok)

  return NextResponse.json({
    ok,
    message: ok ? '✓ Всички таблици и колони са налични' : '⚠ Има липсващи елементи в базата — пусни supabase/migrations_all.sql',
    checks,
  }, { status: ok ? 200 : 500 })
}
