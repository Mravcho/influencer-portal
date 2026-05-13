import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Извлича потребителското име от URL на социална мрежа
function extractUsername(url) {
  try {
    const u = new URL(url)
    // Instagram: instagram.com/username
    // TikTok:   tiktok.com/@username
    // YouTube:  youtube.com/@username или /channel/...
    const parts = u.pathname.split('/').filter(Boolean)
    const raw = parts[0] || ''
    return raw.startsWith('@') ? raw.slice(1) : raw
  } catch {
    return null
  }
}

function detectPlatform(url) {
  const lower = url.toLowerCase()
  if (lower.includes('instagram.com')) return 'instagram'
  if (lower.includes('tiktok.com'))   return 'tiktok'
  if (lower.includes('youtube.com'))  return 'youtube'
  if (lower.includes('facebook.com')) return 'facebook'
  return 'other'
}

// Пробва unavatar.io за Instagram/TikTok/YouTube
async function fetchViaUnavatar(platform, username) {
  const url = `https://unavatar.io/${platform}/${username}?json`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const data = await res.json()
  return data?.url || null
}

// Сваля снимка и я качва в Supabase Storage (за да избегнем hotlink блокировки)
async function mirrorToSupabase(externalUrl, username) {
  const res = await fetch(externalUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`Не успях да сваля снимката (${res.status})`)

  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    throw new Error('Resource не е снимка')
  }
  const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
  const buffer = Buffer.from(await res.arrayBuffer())
  const path = `avatars/${(username || 'avatar').toLowerCase().replace(/[^a-z0-9_-]/g, '')}-${Date.now()}.${ext}`

  const { error } = await supabaseAdmin
    .storage
    .from('branding')
    .upload(path, buffer, { contentType, upsert: false })

  if (error) throw new Error(error.message)

  const { data: { publicUrl } } = supabaseAdmin
    .storage
    .from('branding')
    .getPublicUrl(path)

  return publicUrl
}

// Пробва og:image scraping (работи добре за YouTube)
async function fetchViaOgImage(profileUrl) {
  const res = await fetch(profileUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  })
  const html = await res.text()
  const match =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  return match?.[1] || null
}

export async function POST(request) {
  const userRole = request.headers.get('x-user-role')
  if (userRole !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await request.json()
  if (!url) return NextResponse.json({ error: 'Липсва URL' }, { status: 400 })

  const platform = detectPlatform(url)
  const username = extractUsername(url)

  try {
    let avatarUrl = null

    if (username && ['instagram', 'tiktok', 'youtube', 'facebook'].includes(platform)) {
      avatarUrl = await fetchViaUnavatar(platform, username)
    }

    // Fallback: og:image scraping
    if (!avatarUrl) {
      avatarUrl = await fetchViaOgImage(url)
    }

    if (avatarUrl) {
      // Качваме в нашия Supabase Storage, за да избегнем hotlink 403
      // от Instagram / Facebook CDN
      try {
        const mirrored = await mirrorToSupabase(avatarUrl, username)
        return NextResponse.json({ avatarUrl: mirrored })
      } catch (mirrorErr) {
        // Ако mirror-ът се счупи, връщаме оригинала като fallback
        console.error('Avatar mirror error:', mirrorErr.message)
        return NextResponse.json({ avatarUrl })
      }
    }

    return NextResponse.json({ error: 'Не намерих снимка. Добави URL ръчно.' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
