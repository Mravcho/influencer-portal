import { NextResponse } from 'next/server'

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
      return NextResponse.json({ avatarUrl })
    }

    return NextResponse.json({ error: 'Не намерих снимка. Добави URL ръчно.' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
