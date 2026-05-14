import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/clicks?days=30 → клик статистика за период
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const days   = parseInt(searchParams.get('days') || '30')
  const viewId = searchParams.get('viewId')

  let influencerId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) influencerId = viewId

  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)

  // Total — отделна count заявка за да сме сигурни (не разчитаме на data.length)
  const { count: totalCount } = await supabaseAdmin
    .from('link_clicks')
    .select('id', { count: 'exact', head: true })
    .eq('influencer_id', influencerId)
    .gte('clicked_at', since.toISOString())

  // Реални редове (за timeline, държави, referrers) — взимаме до 500 за тежки сайтове
  const { data: clicks } = await supabaseAdmin
    .from('link_clicks')
    .select('id, link_id, clicked_at, country, city, referrer')
    .eq('influencer_id', influencerId)
    .gte('clicked_at', since.toISOString())
    .order('clicked_at', { ascending: false })
    .limit(500)

  const clickList = clicks || []

  // Дневна разбивка — включваме и днешния ден (затова days+1 итерации)
  const dailyMap = {}
  for (let i = 0; i <= days; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { date: key, count: 0 }
  }
  clickList.forEach(c => {
    const key = c.clicked_at.slice(0, 10)
    if (dailyMap[key]) dailyMap[key].count += 1
  })

  // Top държави
  const countryMap = {}
  clickList.forEach(c => {
    const k = c.country || 'Неизв.'
    countryMap[k] = (countryMap[k] || 0) + 1
  })
  const topCountries = Object.entries(countryMap)
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Top referrers
  const refMap = {}
  clickList.forEach(c => {
    if (!c.referrer) return
    try {
      const host = new URL(c.referrer).hostname
      refMap[host] = (refMap[host] || 0) + 1
    } catch {
      // ignore invalid
    }
  })
  const topReferrers = Object.entries(refMap)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return NextResponse.json({
    total:        totalCount ?? clickList.length,
    sampleSize:   clickList.length,
    daily:        Object.values(dailyMap),
    topCountries,
    topReferrers,
    recent:       clickList.slice(0, 20),
  })
}
