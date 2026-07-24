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

// Изгражда target URL за инфлуенсъри без промокод:
//   - ако има share_link_target → него (с UTM-те)
//   - иначе → SHOP_BASE_URL + SHOP_DEFAULT_PATH (с UTM-те)
// utm_campaign в този случай е id на инфлуенсъра или username (за атрибуция в Shopify)
export function buildNonPromoTargetUrl({ shareLinkTarget, platform, attribution }) {
  // Ако admin е поставил пълен URL (https://...) — ползваме него
  if (shareLinkTarget && /^https?:\/\//i.test(shareLinkTarget.trim())) {
    try {
      const u = new URL(shareLinkTarget.trim())
      const merged = addUtm(`${u.pathname}${u.search}`, {
        source:   'influencer_portal',
        medium:   normalizePlatform(platform),
        campaign: attribution || 'no_promo',
      })
      return `${u.protocol}//${u.host}${merged}`
    } catch {
      // ако URL-ът е невалиден — fallback към default
    }
  }
  // Ако admin е поставил path (напр. /collections/protein) — комбинираме с SHOP_BASE_URL
  if (shareLinkTarget && shareLinkTarget.startsWith('/')) {
    const pathWithUtm = addUtm(shareLinkTarget, {
      source:   'influencer_portal',
      medium:   normalizePlatform(platform),
      campaign: attribution || 'no_promo',
    })
    return `${SHOP_BASE_URL}${pathWithUtm}`
  }
  // Default — homepage
  const pathWithUtm = addUtm(SHOP_DEFAULT_PATH, {
    source:   'influencer_portal',
    medium:   normalizePlatform(platform),
    campaign: attribution || 'no_promo',
  })
  return `${SHOP_BASE_URL}${pathWithUtm}`
}

// Изгражда target URL за КАМПАНИЯ: споделен код (автоматично приложен) + per-influencer UTM.
//   utm_source   = "influencer_portal"
//   utm_medium   = платформата на инфлуенсъра
//   utm_campaign = кодът на кампанията (за групиране)
//   utm_content  = alias на инфлуенсъра  ← по това засичаме кой е
//   _ref         = alias (наш собствен маркер, резерв)
// Ако destUrl е подаден (пълен URL или /path) — води натам; иначе към началната страница.
export function buildCampaignTargetUrl({ promoCode, campaignKey, platform, alias, destUrl }) {
  let base = SHOP_BASE_URL
  let path = SHOP_DEFAULT_PATH
  if (destUrl && /^https?:\/\//i.test(destUrl.trim())) {
    try {
      const u = new URL(destUrl.trim())
      base = `${u.protocol}//${u.host}`
      path = `${u.pathname}${u.search}` || '/'
    } catch { /* fallback към default */ }
  } else if (destUrl && destUrl.startsWith('/')) {
    path = destUrl
  }

  const [pathname, existingQuery = ''] = path.split('?')
  const params = new URLSearchParams(existingQuery)
  params.set('utm_source',   'influencer_portal')
  params.set('utm_medium',   normalizePlatform(platform))
  params.set('utm_campaign', campaignKey || promoCode)
  if (alias) {
    params.set('utm_content', alias)
    params.set('_ref',        alias)
  }
  const pathWithUtm = `${pathname}?${params.toString()}`
  return `${base}/discount/${promoCode}?redirect=${encodeURIComponent(pathWithUtm)}`
}

// Извлича alias на инфлуенсъра от landing_site на Shopify поръчка.
// Чете utm_content (или _ref като резерв). Връща lowercase alias или null.
export function extractCampaignAlias(landingSite) {
  if (!landingSite) return null
  try {
    const qs = landingSite.includes('?') ? landingSite.split('?').slice(1).join('?') : ''
    if (!qs) return null
    const params = new URLSearchParams(qs)
    const alias = params.get('utm_content') || params.get('_ref')
    return alias ? alias.toLowerCase().trim() : null
  } catch {
    return null
  }
}

// Random short code (6 chars, lowercase alphanumeric)
// Lowercase е важно, защото /r/[code] handler-ът lowercase-ва URL-а преди да търси;
// смесен case дава никой-намерен → клиентът не се преадресира към инфлуенсъра и не се брои клик.
export function generateShortCode() {
  return crypto.randomBytes(4).toString('base64url').slice(0, 6).toLowerCase()
}

// Гарантира че инфлуенсърът има default share link.
// short_code = промо кода в lowercase, или random 6-char ако няма промокод.
// Target винаги се изгражда динамично от /r/[code], затова target_url тук е само информационен.
export async function ensureDefaultLink(influencer) {
  if (!influencer?.id) return null

  const { data: existing } = await supabaseAdmin
    .from('share_links')
    .select('id, short_code, target_url')
    .eq('influencer_id', influencer.id)
    .eq('is_default', true)
    .maybeSingle()

  if (existing) return existing

  const code = influencer.promo_code
    ? influencer.promo_code.toLowerCase()
    : generateShortCode()

  const target = influencer.promo_code
    ? buildShopifyDiscountUrl(influencer.promo_code, influencer.platform)
    : buildNonPromoTargetUrl({
        shareLinkTarget: influencer.share_link_target,
        platform:        influencer.platform,
        attribution:     influencer.username || influencer.id,
      })

  const { data, error } = await supabaseAdmin
    .from('share_links')
    .insert({
      influencer_id: influencer.id,
      short_code:    code,
      target_url:    target,
      label:         'Кратък линк за споделяне в соц. мрежи',
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
