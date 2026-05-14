import { supabaseAdmin } from './supabase'
import crypto from 'crypto'

export const SHOP_BASE_URL     = process.env.SHOP_BASE_URL     || 'https://realfood.bg'
export const SHOP_DEFAULT_PATH = process.env.SHOP_DEFAULT_PATH || '/'

// Нормализира платформата за utm_source: instagram, tiktok, facebook, youtube...
function normalizePlatform(platform) {
  if (!platform) return 'social'
  return platform.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Добавя UTM параметри към path-а
function addUtm(path, { source, medium, campaign }) {
  // Path-ът може да съдържа собствен query string
  const [pathname, existingQuery = ''] = path.split('?')
  const params = new URLSearchParams(existingQuery)
  if (source)   params.set('utm_source',   source)
  if (medium)   params.set('utm_medium',   medium)
  if (campaign) params.set('utm_campaign', campaign)
  return `${pathname}?${params.toString()}`
}

// Изгражда Shopify discount URL с UTM параметри.
// utm_source   = "influencer_portal" (фиксиран — кой ни праща)
// utm_medium   = платформата (instagram, tiktok, facebook...) — каква среда
// utm_campaign = промо кода (ANI5, KALI5...) — кой инфлуенсър
export function buildShopifyDiscountUrl(promoCode, platform, redirectPath) {
  const path = redirectPath || SHOP_DEFAULT_PATH
  const pathWithUtm = addUtm(path, {
    source:   'influencer_portal',
    medium:   normalizePlatform(platform),
    campaign: promoCode,
  })
  return `${SHOP_BASE_URL}/discount/${promoCode}?redirect=${encodeURIComponent(pathWithUtm)}`
}

// Random short code (6 chars, alphanumeric)
export function generateShortCode() {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6)
}

// Гарантира че инфлуенсърът има default share link.
// short_code = промо кода в lowercase. Target винаги се изгражда динамично от
// /r/[code], затова target_url тук е само информационен.
export async function ensureDefaultLink(influencer) {
  if (!influencer?.id || !influencer?.promo_code) return null

  const code = influencer.promo_code.toLowerCase()

  const { data: existing } = await supabaseAdmin
    .from('share_links')
    .select('id, short_code, target_url')
    .eq('influencer_id', influencer.id)
    .eq('is_default', true)
    .maybeSingle()

  if (existing) return existing

  const target = buildShopifyDiscountUrl(influencer.promo_code, influencer.platform)

  const { data, error } = await supabaseAdmin
    .from('share_links')
    .insert({
      influencer_id: influencer.id,
      short_code:    code,
      target_url:    target,
      label:         'Промо линк',
      is_default:    true,
    })
    .select('id, short_code, target_url')
    .single()

  if (error) {
    console.error('ensureDefaultLink failed for', influencer.id, error.message)
    return null
  }
  return data
}

// Bot/crawler detection — социалните мрежи preview-ват линкове, не броим това
export function isBot(userAgent) {
  if (!userAgent) return true
  return /bot|crawler|spider|crawling|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|preview|fetch|googleimage|bingbot|yandex|baiduspider|tiktokbot|bytespider|pinterest|skype|applebot/i
    .test(userAgent)
}
