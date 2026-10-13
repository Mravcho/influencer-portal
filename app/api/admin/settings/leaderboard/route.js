import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { leaderboardColumnExists } from '@/lib/portal-settings'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/settings/leaderboard { enabled } → включва/изключва класацията
// за инфлуенсърите. Отделно от общия PATCH на настройките, за да не пипа логото и т.н.
export async function PATCH(request) {
  const { enabled } = await request.json().catch(() => ({}))
  if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Липсва enabled' }, { status: 400 })
  if (!(await leaderboardColumnExists())) {
    return NextResponse.json({
      error: 'В базата липсва колоната — пусни supabase/migration_leaderboard_toggle.sql и опитай пак.',
    }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from('branding')
    .upsert({ id: 1, leaderboard_enabled: enabled, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, enabled })
}
