import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function lastNDates(days) {
  const dates = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

function rangeDates(from, to) {
  const start = new Date(from + 'T00:00:00Z')
  const end   = new Date(to + 'T00:00:00Z')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return null
  const dates = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates.length > 366 ? null : dates
}

// GET /api/admin/utm-links/daily?alias=&days=30  (single link)
// GET /api/admin/utm-links/daily?days=30          (all links, grouped by alias)
// GET /api/admin/utm-links/daily?from=&to=        (custom range, either mode)
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const alias = searchParams.get('alias')
  const days  = parseInt(searchParams.get('days') || '30')
  const from  = searchParams.get('from')
  const to    = searchParams.get('to')

  const dates = from && to ? rangeDates(from, to) : lastNDates(days)
  if (!dates || !dates.length) return NextResponse.json({ error: 'Невалиден период' }, { status: 400 })

  let query = supabaseAdmin
    .from('utm_daily_clicks')
    .select('alias, date, count')
    .gte('date', dates[0])
    .lte('date', dates[dates.length - 1])
  if (alias) query = query.eq('alias', alias)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (alias) {
    const map = new Map((rows || []).map((r) => [r.date, r.count]))
    return NextResponse.json({ alias, data: dates.map((date) => ({ date, count: map.get(date) ?? 0 })) })
  }

  const byAlias = {}
  for (const r of rows || []) {
    ;(byAlias[r.alias] ||= new Map()).set(r.date, r.count)
  }
  const allData = Object.entries(byAlias).map(([a, m]) => ({
    alias: a,
    data: dates.map((date) => ({ date, count: m.get(date) ?? 0 })),
  }))
  return NextResponse.json({ allData, days })
}
