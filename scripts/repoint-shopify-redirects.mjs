/**
 * Cutover: repoint the store's Shopify URL redirects (/u/<alias>) from their old
 * targets to portal.realfood.bg/go/<alias>, so existing short links keep working
 * AND now funnel clicks into the portal. Idempotent — safe to re-run.
 *
 * Usage: node --env-file=.env.local scripts/repoint-shopify-redirects.mjs [path/to/utm-data.json]
 */
import { readFileSync } from 'node:fs'

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const API_VERSION = '2026-01'
const PORTAL = (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.realfood.bg').replace(/\/$/, '')
const JSON_PATH = process.argv[2] || '/Users/tonov/Desktop/utm-link-manager/handoff/utm-data.json'

const gql = async (query, variables) => {
  const r = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors))
  return j.data
}

const MUTATION = `
mutation($id: ID!, $redirect: UrlRedirectInput!) {
  urlRedirectUpdate(id: $id, urlRedirect: $redirect) {
    urlRedirect { id path target }
    userErrors { field message }
  }
}`

async function main() {
  const dump = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
  const links = dump.links.filter((l) => l.shop === DOMAIN && l.shopifyRedirectId)
  console.log(`Repointing ${links.length} redirects on ${DOMAIN} → ${PORTAL}/go/<alias>\n`)

  let ok = 0, skipped = 0, failed = 0
  for (const l of links) {
    const target = `${PORTAL}/go/${l.alias}`
    try {
      const d = await gql(MUTATION, { id: l.shopifyRedirectId, redirect: { path: `/u/${l.alias}`, target } })
      const errs = d.urlRedirectUpdate.userErrors
      if (errs && errs.length) { console.log(`  ✗ ${l.alias}: ${errs.map((e) => e.message).join('; ')}`); failed++ }
      else { ok++; if (ok <= 5 || ok % 20 === 0) console.log(`  ✓ ${l.alias} → ${target}`) }
    } catch (e) {
      if (/does not exist|Redirect/i.test(e.message)) { console.log(`  – ${l.alias}: redirect gone, skipped`); skipped++ }
      else { console.log(`  ✗ ${l.alias}: ${e.message.slice(0, 120)}`); failed++ }
    }
  }
  console.log(`\nDone. ✓ ${ok} updated, – ${skipped} skipped, ✗ ${failed} failed.`)
  if (failed) process.exitCode = 1
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1) })
