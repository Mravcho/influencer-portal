import { supabaseAdmin } from './supabase'
import crypto from 'crypto'

export const SHOP_BASE_URL = process.env.SHOP_BASE_URL || 'https://realfood.bg'

// Изгражда Shopify discount URL за даден промокод и redirect path
export function buildShopifyDiscountUrl(promoCode, redirectPath = '/') {
  const path = encodeURIComponent(redirectPath)
  return `${SHOP_BASE_URL}/discount/${promoCode}?redirect=${path}`
}

// Random short code (6 chars, alphanumeric)
export function generateShortCode() {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6)
}

// Гарантира че инфлуенсърът има default share link.
// short_code = промо кода в lowercase. Target = Shopify discount URL.
export async function ensureDefaultLink(influencer) {
  if (!influencer?.id || !influencer?.promo_code) return null

  const code = influencer.promo_code.toLowerCase()

  // Има ли вече default за този инфлуенсър?
  const { data: existing } = await supabaseAdmin
    .from('share_links')
    .select('id, short_code, target_url')
    .eq('influencer_id', influencer.id)
    .eq('is_default', true)
    .maybeSingle()

  if (existing) return existing

  const target = buildShopifyDiscountUrl(influencer.promo_code, '/')

  const { data, error } = await supabaseAdmin
    .from('share_links')
    .insert({
      influencer_id: influencer.id,
      short_code:    code,
      target_url:    target,
      label:         'Главна страница',
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
