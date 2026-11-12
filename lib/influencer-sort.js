// Подредби на списъка с инфлуенсъри в /admin/influencers. Чиста логика без
// достъп до база, за да може да се тества отделно.
//
// Полетата идват от GET /api/admin/influencers:
//   recentOrderCount — поръчки за последните 90 дни (без анулирани)
//   clickCount       — кликове по линковете за последните 90 дни
//   orderCount       — всички поръчки (без анулирани)
//   totalRevenue     — приход от всички поръчки

export const INFLUENCER_SORTS = [
  { value: 'effective', label: 'Най-ефективни' },
  { value: 'orders',    label: 'Най-много поръчки (общо)' },
  { value: 'clicks',    label: 'Най-много кликове (90 дни)' },
  { value: 'revenue',   label: 'Най-висок приход' },
  { value: 'newest',    label: 'Най-нови профили' },
  { value: 'name',      label: 'По име (А–Я)' },
]
export const DEFAULT_INFLUENCER_SORT = 'effective'

const num = (v) => Number(v) || 0
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'bg', { sensitivity: 'base' })
const desc = (key) => (a, b) => num(b[key]) - num(a[key])
// Първата разлика решава; при пълно равенство — по име, за да е стабилно.
const chain = (...fns) => (a, b) => {
  for (const fn of fns) {
    const d = fn(a, b)
    if (d) return d
  }
  return byName(a, b)
}

// „Най-ефективни“: първо тези, които продават СЕГА (поръчки за 90 дни), после
// тези, които носят трафик (кликове за 90 дни), после по обща история.
// Деактивираните профили отиват най-долу — с тях не се работи в момента.
const activeFirst = (a, b) => (a.active === false) - (b.active === false)

const COMPARATORS = {
  effective: chain(activeFirst, desc('recentOrderCount'), desc('clickCount'), desc('orderCount'), desc('totalRevenue')),
  orders:    chain(desc('orderCount'), desc('totalRevenue')),
  clicks:    chain(desc('clickCount'), desc('recentOrderCount')),
  revenue:   chain(desc('totalRevenue'), desc('orderCount')),
  newest:    chain((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
  name:      byName,
}

export function sortInfluencers(list, sortBy = DEFAULT_INFLUENCER_SORT) {
  return [...(list || [])].sort(COMPARATORS[sortBy] || COMPARATORS[DEFAULT_INFLUENCER_SORT])
}

// Има ли изобщо активност — за да не слагаме пореден номер на празни профили.
export function hasActivity(inf) {
  return num(inf.recentOrderCount) > 0 || num(inf.clickCount) > 0 || num(inf.orderCount) > 0
}
