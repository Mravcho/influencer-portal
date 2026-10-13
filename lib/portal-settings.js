import { supabaseAdmin } from './supabase'

// Дали инфлуенсърите виждат класацията (branding.leaderboard_enabled).
// Без колоната (миграцията не е пусната) — включена, както досега.
let probe = null
export async function leaderboardColumnExists() {
  if (probe && (probe.ok || Date.now() - probe.at < 60 * 1000)) return probe.ok
  const { error } = await supabaseAdmin.from('branding').select('leaderboard_enabled').limit(1)
  probe = { ok: !error, at: Date.now() }
  if (error) console.warn('branding.leaderboard_enabled липсва — пусни supabase/migration_leaderboard_toggle.sql')
  return !error
}

export async function isLeaderboardEnabled() {
  if (!(await leaderboardColumnExists())) return true
  const { data } = await supabaseAdmin.from('branding').select('leaderboard_enabled').eq('id', 1).maybeSingle()
  return data?.leaderboard_enabled !== false
}
