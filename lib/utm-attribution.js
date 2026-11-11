// Чиста логика за приписване на поръчка към UTM линк — без достъп до база
// или Shopify, за да може да се тества отделно.
//
// Една поръчка се приписва по ДВА независими начина и двата се пазят:
//
//  1) „Първо влизане“ (utm_orders.alias)
//     Източник: полето landing_site на поръчката. Shopify записва там първата
//     страница, на която клиентът е кацнал, и я помни около две седмици. Ако
//     тя носи _ref=<alias>, поръчката е дошла през нашия кратък линк.
//     Изпуска клиент, който вече е бил в сайта (имейл, реклама, директно) и
//     чак после е кликнал линка — тогава landing_site сочи по-ранното влизане.
//
//  2) „Последен клик“ (utm_orders.last_click_alias)
//     Източник: Customer Journey на поръчката (lastVisit.utmParameters) —
//     същото, по което Shopify смята отчетите си по UTM. Shopify не пази _ref,
//     затова линкът се разпознава по комбинацията source + medium + campaign +
//     content + term. Изпуска клиент, който е кликнал линка, а после се е
//     върнал директно и е поръчал — последното му посещение е без UTM.

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

export function matchAlias(landingSite, knownAliases) {
  return extractAliasCandidates(landingSite).find(a => knownAliases.has(a)) || null
}

const norm = (v) => (v == null ? '' : String(v)).trim().toLowerCase()

// Ключ за сравнение на UTM параметри — без значение от регистър и интервали.
export function utmKey({ source, medium, campaign, content, term } = {}) {
  return [source, medium, campaign, content, term].map(norm).join('\u0001')
}

const linkUtm = (l) => ({
  source: l.utm_source, medium: l.utm_medium, campaign: l.utm_campaign,
  content: l.utm_content, term: l.utm_term,
})

// links: редове от utm_links (alias + utm_*).
// Връща { aliases: Set, byUtm: Map(utmKey -> [alias, ...]) }.
export function buildLinkIndex(links) {
  const aliases = new Set()
  const byUtm = new Map()
  for (const l of links || []) {
    if (!l?.alias) continue
    aliases.add(l.alias)
    if (!norm(l.utm_source) && !norm(l.utm_campaign)) continue
    const key = utmKey(linkUtm(l))
    const list = byUtm.get(key)
    if (list) list.push(l.alias)
    else byUtm.set(key, [l.alias])
  }
  return { aliases, byUtm }
}

// Линковете, чиито UTM параметри съвпадат с тези на последното посещение.
// Празен масив = последният клик не е през наш линк.
export function lastClickCandidates(utm, index) {
  if (!utm) return []
  if (!norm(utm.source) && !norm(utm.campaign)) return []
  return index.byUtm.get(utmKey(utm)) || []
}

// Един кандидат → той. Няколко линка с еднакви UTM параметри са неразличими
// за Shopify; тогава решава alias-ът от landing_site, ако е сред тях. Иначе
// поръчката не се приписва на никого, вместо да се припише наслуки.
export function resolveLastClick(candidates, landingAlias = null) {
  if (!candidates || candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  return landingAlias && candidates.includes(landingAlias) ? landingAlias : null
}

// Колко ДРУГИ линка имат същите UTM параметри като този.
export function sharedUtmCount(link, index) {
  if (!link?.alias) return 0
  if (!norm(link.utm_source) && !norm(link.utm_campaign)) return 0
  const list = index.byUtm.get(utmKey(linkUtm(link))) || []
  return list.filter(a => a !== link.alias).length
}

// Обобщение по alias за /admin/utm-links. Анулираните и рефунднатите се
// броят отделно и не влизат в приход.
const DEAD = new Set(['voided', 'refunded'])

const blankStats = () => ({
  // първо влизане (landing_site)
  orders: 0, revenue: 0, voided: 0,
  // последен клик (Customer Journey)
  lastClickOrders: 0, lastClickRevenue: 0, lastClickVoided: 0,
  // поръчки, които присъстват и в двете
  both: 0,
  lastOrderAt: null,
})

export function aggregateUtmOrders(rows) {
  const byAlias = {}
  const get = (alias) => byAlias[alias] || (byAlias[alias] = blankStats())
  const touch = (s, at) => { if (at && (!s.lastOrderAt || at > s.lastOrderAt)) s.lastOrderAt = at }

  for (const r of rows || []) {
    const dead = !!r.cancelled_at || DEAD.has(r.financial_status)
    const price = parseFloat(r.total_price || 0)

    if (r.alias) {
      const s = get(r.alias)
      if (dead) s.voided++
      else { s.orders++; s.revenue += price }
      touch(s, r.created_at)
    }
    if (r.last_click_alias) {
      const s = get(r.last_click_alias)
      if (dead) s.lastClickVoided++
      else { s.lastClickOrders++; s.lastClickRevenue += price }
      touch(s, r.created_at)
    }
    if (!dead && r.alias && r.alias === r.last_click_alias) get(r.alias).both++
  }

  for (const s of Object.values(byAlias)) {
    s.revenue          = Math.round(s.revenue * 100) / 100
    s.lastClickRevenue = Math.round(s.lastClickRevenue * 100) / 100
  }
  return byAlias
}

// Слива двете обхождания на магазина в редове за utm_orders.
//   landingSeen: Map(id -> alias|null) за ВСЯКА поръчка от REST обхождането
//   baseById:    Map(id -> основни данни за поръчката) от същото обхождане
//   lastClick:   Map(id -> [alias, ...]) само за поръчки с готов Customer Journey
// Връща две групи, защото се записват с различен набор колони:
//   both        — известни са и двете приписвания (last_click_alias се презаписва)
//   landingOnly — последният клик още е неизвестен (last_click_alias не се пипа)
export function mergeScan({ landingSeen, baseById, lastClick }) {
  const both = []
  const landingOnly = []

  for (const [id, alias] of landingSeen) {
    const base = baseById.get(id)
    if (!base) continue
    if (lastClick && lastClick.has(id)) {
      const last = resolveLastClick(lastClick.get(id), alias)
      if (!alias && !last) continue
      both.push({ ...base, alias: alias || null, last_click_alias: last })
    } else if (alias) {
      landingOnly.push({ ...base, alias })
    }
  }
  return { both, landingOnly }
}
