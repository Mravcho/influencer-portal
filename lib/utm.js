import crypto from 'crypto'

// Portal base for short links → portal.realfood.bg/go/<alias>
export const PORTAL_URL = (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg').replace(/\/$/, '')

const ALIAS_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // no ambiguous chars (l/1/o/0/i)

export function generateAlias(len = 5) {
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += ALIAS_ALPHABET[bytes[i] % ALIAS_ALPHABET.length]
  return out
}

export function sanitizeAlias(input) {
  return (input || '')
    .toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Build the destination URL with UTM params + _ref=<alias>. Throws on invalid URL.
export function buildUtmUrl({ destUrl, source, medium, campaign, term, content, utmId, alias }) {
  const url = new URL(destUrl)
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', medium)
  url.searchParams.set('utm_campaign', campaign)
  if (term)    url.searchParams.set('utm_term', term)
  if (content) url.searchParams.set('utm_content', content)
  if (utmId)   url.searchParams.set('utm_id', utmId)
  if (alias)   url.searchParams.set('_ref', alias)
  return url.toString()
}

export function buildShortUrl(alias) {
  return `${PORTAL_URL}/go/${alias}`
}
