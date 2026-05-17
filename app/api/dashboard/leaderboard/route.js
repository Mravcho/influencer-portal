import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const VOIDED_STATUSES = new Set(['voided', 'refunded'])

// Връща анонимизирана класация — само първо име + initial на фамилия + брой поръчки
// БЕЗ комисионни, БЕЗ приходи. Това е версията за инфлуенсърите.
export async function GET(request) {
  const userRole = request.headers.get('x-user-role')
  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month')
  const viewId     = searchParams.get('viewId') // admin преглежда конкретен инфлуенсър

  // По default — текущият логнат user. Ако admin прави viewId — приемаме него.
  let currentUserId = request.headers.get('x-user-id')
  if (userRole === 'admin' && viewId) {
    currentUserId = viewId
  }

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
    .select('id, name, promo_code')
    .eq('active', true)
    .eq('exclude_from_leaderboard', false)

  const nameById = Object.fromEntries((influencers || []).map(i => [i.id, i.name]))
  const promoById = Object.fromEntries((influencers || []).map(i => [i.id, i.promo_code]))

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

  // Включваме всички активни инфлуенсъри (дори с 0 поръчки)
  Object.keys(nameById).forEach(id => {
    if (!(id in counts)) counts[id] = 0
  })

  const ranked = Object.entries(counts)
    .map(([id, orders]) => ({ id, orders }))
    .sort((a, b) => b.orders - a.orders)
    .map((e, idx) => {
      const isMe = e.id === currentUserId
      return {
        id: e.id,
        // Чуждите инфлуенсъри се идентифицират с промокод (без име); своят ред показва истинско име
        name: isMe ? nameById[e.id] : (promoById[e.id] || 'Аноним'),
        orders: isMe ? e.orders : null,
        isMe,
        rank: idx + 1,
      }
    })

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
