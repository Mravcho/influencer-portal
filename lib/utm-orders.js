import { supabaseAdmin } from './supabase'
import { fetchStoreOrdersPage } from './shopify'

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

// Кандидати за alias от landing URL-а на поръчката.
// `_ref` е нашият маркер (слагаме го в buildUtmUrl), `utm_content` е резерв —
// кампанийните линкове носят alias-а там. Рекламните платформи също пълнят
// utm_content със свои стойности, затова резултатът се сверява със списъка
// от реални alias-и, преди да се запише каквото и да е.
export function extractAliasCandidates(landingSite) {
  if (!landingSite) return []
  const qs = landingSite.includes('?') ? landingSite.split('?').slice(1).join('?') : ''
  if (!qs) return []
  try {
    const p = new URLSearchParams(qs)
    return ['_ref', 'utm_content']
      .map(k => p.get(k))
      .filter(Boolean)
      .map(v => v.toLowerCase().trim())
  } catch {
    return []
  }
}

export async function loadKnownAliases() {
  const { data } = await supabaseAdmin.from('utm_links').select('alias')
  return new Set((data || []).map(l => l.alias).filter(Boolean))
}

export function matchAlias(landingSite, knownAliases) {
  return extractAliasCandidates(landingSite).find(a => knownAliases.has(a)) || null
}

// Записва/обновява една поръчка. `order` е Shopify REST обект.
export async function recordUtmOrder(order, knownAliases) {
  if (!(await utmOrdersTableExists())) return null
  const alias = matchAlias(order.landing_site, knownAliases)
  if (!alias) return null

  const { error } = await supabaseAdmin.from('utm_orders').upsert({
    shopify_order_id: order.id,
    alias,
    order_number:     order.order_number ? `#${order.order_number}` : null,
    created_at:       order.created_at,
    total_price:      parseFloat(order.total_price || 0),
    currency:         order.currency || null,
    financial_status: (order.financial_status || '').toLowerCase() || null,
    cancelled_at:     order.cancelled_at || null,
    synced_at:        new Date().toISOString(),
  }, { onConflict: 'shopify_order_id', ignoreDuplicates: false })

  if (error) {
    console.error('recordUtmOrder failed:', error.message)
    return null
  }
  return alias
}

// Обхожда поръчките в магазина (не само тези с промокод) и записва онези с
// наш alias. `days` ограничава прозореца; 0 = от начална дата DEFAULT_SINCE.
const DEFAULT_SINCE = '2026-01-01T00:00:00Z'

export async function scanUtmOrders({ days = 30, maxPages = 60 } = {}) {
  if (!(await utmOrdersTableExists())) {
    return { error: 'Липсва таблица utm_orders — пусни миграцията.' }
  }
  const knownAliases = await loadKnownAliases()
  const since = days > 0
    ? new Date(Date.now() - days * 86400000).toISOString()
    : DEFAULT_SINCE

  let pageInfo = null
  let scanned = 0, matched = 0, pages = 0
  const rows = []

  while (pages < maxPages) {
    const { orders, nextPageInfo } = await fetchStoreOrdersPage({ since, pageInfo })
    for (const o of orders) {
      scanned++
      const alias = matchAlias(o.landing_site, knownAliases)
      if (!alias) continue
      matched++
      rows.push({
        shopify_order_id: o.id,
        alias,
        order_number:     o.order_number ? `#${o.order_number}` : null,
        created_at:       o.created_at,
        total_price:      parseFloat(o.total_price || 0),
        currency:         o.currency || null,
        financial_status: (o.financial_status || '').toLowerCase() || null,
        cancelled_at:     o.cancelled_at || null,
        synced_at:        new Date().toISOString(),
      })
    }
    pages++
    pageInfo = nextPageInfo
    if (!pageInfo) break
  }

  // Upsert на партиди — PostgREST не обича прекалено големи заявки.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin
      .from('utm_orders')
      .upsert(rows.slice(i, i + 200), { onConflict: 'shopify_order_id', ignoreDuplicates: false })
    if (error) return { error: error.message, scanned, matched, pages }
  }

  return { scanned, matched, pages, since, truncated: !!pageInfo }
}

// Обобщение по alias за /admin/utm-links. Анулираните и рефунднатите се
// броят отделно и не влизат в приход.
const DEAD = new Set(['voided', 'refunded'])

export async function utmOrderStatsByAlias() {
  if (!(await utmOrdersTableExists())) return {}

  const byAlias = {}
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('utm_orders')
      .select('alias, total_price, financial_status, cancelled_at, created_at')
      .range(from, from + 999)
    if (error) break
    for (const r of data || []) {
      const s = byAlias[r.alias] || (byAlias[r.alias] = { orders: 0, revenue: 0, voided: 0, lastOrderAt: null })
      if (r.cancelled_at || DEAD.has(r.financial_status)) {
        s.voided++
      } else {
        s.orders++
        s.revenue += parseFloat(r.total_price || 0)
      }
      if (!s.lastOrderAt || r.created_at > s.lastOrderAt) s.lastOrderAt = r.created_at
    }
    if (!data || data.length < 1000) break
  }

  for (const s of Object.values(byAlias)) s.revenue = Math.round(s.revenue * 100) / 100
  return byAlias
}
