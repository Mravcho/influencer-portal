import { supabaseAdmin } from './supabase'
import { fetchStoreOrdersPage, fetchOrdersLastClickPage, fetchOrderLastClick } from './shopify'
import { fetchAllRows } from './order-status'
import {
  buildLinkIndex, matchAlias, lastClickCandidates, resolveLastClick,
  aggregateUtmOrders, mergeScan,
} from './utm-attribution'

// Всяка поръчка се приписва към UTM линк по два начина — „първо влизане“
// (alias) и „последен клик“ (last_click_alias). Какво значи всяко и защо се
// разминават е описано в lib/utm-attribution.js.

// Таблицата идва с migration_utm_orders.sql. Докато не е пусната, всяко
// писане би счупило webhook-а — затова проверяваме веднъж на студен старт.
let tableSupport = null
export async function utmOrdersTableExists() {
  if (tableSupport !== null) return tableSupport
  const { error } = await supabaseAdmin.from('utm_orders').select('shopify_order_id').limit(1)
  tableSupport = !error
  if (!tableSupport) {
    console.warn('таблица utm_orders липсва — пусни supabase/migration_utm_orders.sql')
  }
  return tableSupport
}

// Колоната last_click_alias идва с migration_utm_orders_last_click.sql.
// Помним само положителния отговор: така, щом миграцията се пусне, второто
// число се появява веднага, без да чакаме нов студен старт.
let lastClickSupport = false
export async function utmOrdersHaveLastClick() {
  if (lastClickSupport) return true
  if (!(await utmOrdersTableExists())) return false
  const { error } = await supabaseAdmin.from('utm_orders').select('last_click_alias').limit(1)
  lastClickSupport = !error
  return lastClickSupport
}

// Всички линкове: alias-ите (за landing_site) и UTM параметрите им (за
// последния клик). utm_links расте с всяка кампания, затова четем на страници.
export async function loadLinkIndex() {
  const links = await fetchAllRows((from, to) =>
    supabaseAdmin
      .from('utm_links')
      .select('alias, utm_source, utm_medium, utm_campaign, utm_content, utm_term')
      .order('alias')
      .range(from, to)
  )
  return buildLinkIndex(links)
}

const baseRow = (o) => ({
  shopify_order_id: o.id,
  order_number:     o.order_number ? `#${o.order_number}` : null,
  created_at:       o.created_at,
  total_price:      parseFloat(o.total_price || 0),
  currency:         o.currency || null,
  financial_status: (o.financial_status || '').toLowerCase() || null,
  cancelled_at:     o.cancelled_at || null,
  synced_at:        new Date().toISOString(),
})

// Записва/обновява една поръчка. `order` е Shopify REST обект (от webhook-а).
export async function recordUtmOrder(order, index) {
  if (!(await utmOrdersTableExists())) return null
  const alias = matchAlias(order.landing_site, index.aliases)

  // Последен клик: undefined = още не знаем (journey не е готово или грешка),
  // null = знаем, че не е през наш линк.
  let last
  if (index.byUtm.size > 0 && (await utmOrdersHaveLastClick())) {
    const journey = await fetchOrderLastClick(order.id)
    if (journey?.ready) last = resolveLastClick(lastClickCandidates(journey.utm, index), alias)
  }

  if (!alias && !last) return null

  // Колона, която липсва в заявката, не се пипа при обновяване — така
  // „неизвестно“ не изтрива вече записано приписване.
  const row = baseRow(order)
  if (alias) row.alias = alias
  if (last !== undefined) row.last_click_alias = last

  const { error } = await supabaseAdmin
    .from('utm_orders')
    .upsert(row, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

  if (error) {
    console.error('recordUtmOrder failed:', error.message)
    return null
  }
  return alias || last
}

// --- Обхождане на магазина ---
// `days` ограничава прозореца; 0 = от начална дата DEFAULT_SINCE.
const DEFAULT_SINCE = '2026-01-01T00:00:00Z'

// REST: всички поръчки (не само тези с промокод) с техния landing_site.
async function scanLanding({ since, maxPages, index }) {
  const landingSeen = new Map() // id -> alias|null
  const baseById = new Map()
  let pageInfo = null
  let matched = 0, pages = 0

  while (pages < maxPages) {
    const { orders, nextPageInfo } = await fetchStoreOrdersPage({ since, pageInfo })
    for (const o of orders) {
      const id = String(o.id)
      const alias = matchAlias(o.landing_site, index.aliases)
      if (alias) matched++
      landingSeen.set(id, alias)
      baseById.set(id, baseRow(o))
    }
    pages++
    pageInfo = nextPageInfo
    if (!pageInfo) break
  }
  return { landingSeen, baseById, scanned: landingSeen.size, matched, pages, truncated: !!pageInfo }
}

// GraphQL: последният клик на същите поръчки, най-новите първи. Спира при
// `deadline`, за да остане време за записа — по-старите остават за следващия път.
async function scanLastClick({ since, index, deadline }) {
  const lastClick = new Map() // id -> [alias, ...] само за готови journey-та
  let cursor = null
  let scanned = 0, pending = 0, truncated = false

  do {
    if (Date.now() > deadline) { truncated = true; break }
    const { orders, nextCursor } = await fetchOrdersLastClickPage({ since, after: cursor })
    for (const o of orders) {
      scanned++
      if (!o.ready) { pending++; continue }
      lastClick.set(o.id, lastClickCandidates(o.utm, index))
    }
    cursor = nextCursor
  } while (cursor)

  return { lastClick, scanned, pending, truncated }
}

export async function scanUtmOrders({ days = 30, maxPages = 60, budgetMs = 200000 } = {}) {
  if (!(await utmOrdersTableExists())) {
    return { error: 'Липсва таблица utm_orders — пусни миграцията.' }
  }
  const index = await loadLinkIndex()
  const withLastClick = await utmOrdersHaveLastClick()
  const since = days > 0
    ? new Date(Date.now() - days * 86400000).toISOString()
    : DEFAULT_SINCE

  // Двете обхождания са към различни API-та с отделни лимити — вървят заедно.
  const [landing, last] = await Promise.all([
    scanLanding({ since, maxPages, index }),
    withLastClick
      ? scanLastClick({ since, index, deadline: Date.now() + budgetMs })
          .catch((err) => ({ error: err.message }))
      : null,
  ])

  const { both, landingOnly } = mergeScan({
    landingSeen: landing.landingSeen,
    baseById:    landing.baseById,
    lastClick:   last?.lastClick || null,
  })

  const summary = {
    scanned: landing.scanned, matched: landing.matched, pages: landing.pages,
    since, truncated: landing.truncated,
    lastClickSupported: withLastClick,
    lastClickMatched:   both.filter((r) => r.last_click_alias).length,
    lastClickPending:   last?.pending ?? 0,
    lastClickTruncated: !!last?.truncated,
    lastClickError:     last?.error || null,
  }

  // Upsert на партиди — PostgREST не обича прекалено големи заявки. Двете
  // групи са с различен набор колони и затова се записват поотделно.
  for (const rows of [both, landingOnly]) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin
        .from('utm_orders')
        .upsert(rows.slice(i, i + 200), { onConflict: 'shopify_order_id', ignoreDuplicates: false })
      if (error) return { ...summary, error: error.message }
    }
  }

  return summary
}

// Обобщение по alias за /admin/utm-links.
export async function utmOrderStatsByAlias() {
  if (!(await utmOrdersTableExists())) return {}
  const withLastClick = await utmOrdersHaveLastClick()
  const columns = 'alias, total_price, financial_status, cancelled_at, created_at'
    + (withLastClick ? ', last_click_alias' : '')

  let rows = []
  try {
    rows = await fetchAllRows(
      (from, to) => supabaseAdmin
        .from('utm_orders')
        .select(columns)
        .order('shopify_order_id')
        .range(from, to),
      { max: 50000 }
    )
  } catch (err) {
    console.error('utmOrderStatsByAlias failed:', err.message)
  }
  return aggregateUtmOrders(rows)
}
