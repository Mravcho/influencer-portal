import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const VOIDED_STATUSES = new Set(['voided', 'refunded'])

// Връща анонимизирана класация — само първо име + initial на фамилия + брой поръчки
// БЕЗ комисионни, БЕЗ приходи. Това е версията за инфлуенсърите.
export async function GET(request) {
  const currentUserId = request.headers.get('x-user-id')
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month')

  const now = new Date()
  let year, month
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    [year, month] = monthParam.split('-').map(Number)
  } else {
    year  = now.getFullYear()
    month = now.getMonth() + 1
  }

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth   = new Date(year, month, 1)

  const { data: influencers } = await supabaseAdmin
    .from('influencers')
    .select('id, name')
    .eq('active', true)

  const nameById = Object.fromEntries((influencers || []).map(i => [i.id, i.name]))

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('influencer_id, financial_status')
    .gte('created_at_shopify', startOfMonth.toISOString())
    .lt('created_at_shopify', endOfMonth.toISOString())

  const counts = {}
  ;(orders || []).forEach(o => {
    if (VOIDED_STATUSES.has(o.financial_status)) return
    if (!nameById[o.influencer_id]) return
    counts[o.influencer_id] = (counts[o.influencer_id] || 0) + 1
  })

  // Анонимизирай имената до първо име + initial
  const anonymize = (fullName) => {
    const parts = (fullName || '').trim().split(/\s+/)
    if (parts.length === 0) return 'Аноним'
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`
  }

  const ranked = Object.entries(counts)
    .map(([id, orders]) => ({
      id,
      name: anonymize(nameById[id]),
      orders,
      isMe: id === currentUserId,
    }))
    .sort((a, b) => b.orders - a.orders)
    .map((e, idx) => ({ ...e, rank: idx + 1 }))

  // Намираме мястото на текущия инфлуенсър
  const myRank = ranked.find(r => r.isMe) || null

  // Връщаме топ 10 + ако текущия не е там — добавяме го отделно
  const top10 = ranked.slice(0, 10)
  const meOutsideTop = myRank && myRank.rank > 10 ? myRank : null

  return NextResponse.json({
    month: `${year}-${String(month).padStart(2, '0')}`,
    top10,
    meOutsideTop,
    myRank: myRank?.rank || null,
    totalParticipants: ranked.length,
  })
}
