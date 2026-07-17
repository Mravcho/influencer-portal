/**
 * Import UTM links + daily clicks from the utm-link-manager export into the
 * portal's Supabase (utm_links + utm_daily_clicks). Idempotent — upserts by
 * alias / (alias,date), so re-running does not double counts.
 *
 * Requires the utm_links / utm_daily_clicks tables to already exist
 * (run supabase/migration_utm_links.sql first).
 *
 * Usage (from portal root, env has NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node --env-file=.env.local scripts/import-utm-data.mjs [path/to/utm-data.json]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const JSON_PATH =
  process.argv[2] || '/Users/tonov/Desktop/utm-link-manager/handoff/utm-data.json'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

async function main() {
  const dump = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
  console.log(`Source: ${dump.totals.links} links, ${dump.totals.dailyClickRows} daily rows, ${dump.totals.totalClicks} clicks`)

  const linkRows = dump.links.map((l) => ({
    alias:         l.alias,
    label:         l.campaign || null,
    dest_url:      l.destUrl,
    full_url:      l.fullUrl,
    utm_source:    l.source,
    utm_medium:    l.medium,
    utm_campaign:  l.campaign,
    utm_term:      l.term || null,
    utm_content:   l.content || null,
    utm_id:        l.utmId || null,
    clicks:        l.clicks || 0,
    last_click_at: l.lastClickAt || null,
    active:        true,
    legacy_shop:   l.shop || null,
    created_at:    l.createdAt,
  }))

  let links = 0
  for (const batch of chunk(linkRows, 200)) {
    const { error } = await supabase.from('utm_links').upsert(batch, { onConflict: 'alias' })
    if (error) throw new Error(`utm_links upsert failed: ${error.message}`)
    links += batch.length
  }
  console.log(`✓ upserted ${links} links`)

  const clickRows = dump.dailyClicks.map((c) => ({ alias: c.alias, date: c.date, count: c.count }))
  let clicks = 0
  for (const batch of chunk(clickRows, 500)) {
    const { error } = await supabase.from('utm_daily_clicks').upsert(batch, { onConflict: 'alias,date' })
    if (error) throw new Error(`utm_daily_clicks upsert failed: ${error.message}`)
    clicks += batch.length
  }
  console.log(`✓ upserted ${clicks} daily-click rows`)

  // Verify
  const [{ count: lc }, { count: dc }] = await Promise.all([
    supabase.from('utm_links').select('id', { count: 'exact', head: true }),
    supabase.from('utm_daily_clicks').select('id', { count: 'exact', head: true }),
  ])
  console.log(`\nSupabase now holds: ${lc} utm_links, ${dc} utm_daily_clicks`)
}

main().catch((e) => { console.error('Import failed:', e.message); process.exit(1) })
