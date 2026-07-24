import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncCampaign } from '@/lib/campaign-sync'

export const dynamic = 'force-dynamic'

// POST /api/admin/campaigns/sync { campaignId } → синк на кампанийните поръчки (UTM атрибуция)
export async function POST(request) {
  const { campaignId } = await request.json()
  if (!campaignId) return NextResponse.json({ error: 'Липсва campaignId' }, { status: 400 })

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns').select('*').eq('id', campaignId).single()
  if (error || !campaign) return NextResponse.json({ error: 'Кампанията не съществува' }, { status: 404 })

  try {
    const result = await syncCampaign(campaign)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
