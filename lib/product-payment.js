import { supabaseAdmin } from './supabase'

// Плащане на заявка за продукт с изкараната комисионна (product_requests.payment_method):
//   'self'       — инфлуенсърът плаща сам
//   'commission' — от баланса за теглене; ако не стига — каквото има, а остатъкът
//                  се събира с наложен платеж (product_requests.paid_from_commission)
// Всяка колона се проверява поотделно: докато миграцията не е пусната, съответната
// възможност просто не се показва.

// „Има я“ се помни завинаги; „няма я“ — само минута, за да се хване миграция,
// пусната докато сървърът работи (иначе инстанцията помни старото до рестарт).
const probes = {}
const RETRY_MS = 60 * 1000
async function columnExists(table, column) {
  const key = `${table}.${column}`
  const hit = probes[key]
  if (hit && (hit.ok || Date.now() - hit.at < RETRY_MS)) return hit.ok
  const { error } = await supabaseAdmin.from(table).select(column).limit(1)
  probes[key] = { ok: !error, at: Date.now() }
  if (error) console.warn(`${key} липсва — пусни миграцията в supabase/`)
  return !error
}

export const productPaymentSupported  = () => columnExists('product_requests', 'payment_method')
export const partialPaymentSupported  = () => columnExists('product_requests', 'paid_from_commission')
export const productDiscountSupported = () => columnExists('influencers', 'product_discount_pct')

// Колко от paid_total е платено от комисионната
export function commissionPart(r) {
  if (r?.payment_method !== 'commission') return 0
  const total = Number(r.paid_total) || 0
  if (r.paid_from_commission == null) return total
  return Math.min(total, Number(r.paid_from_commission) || 0)
}

// Колко от комисионната е „похарчено“ за продукти — всяка неотказана заявка,
// платена (изцяло или частично) от баланса.
export async function commissionSpentOnProducts(influencerId) {
  if (!(await productPaymentSupported())) return 0
  const partial = await partialPaymentSupported()
  const { data, error } = await supabaseAdmin
    .from('product_requests')
    .select(`paid_total, payment_method${partial ? ', paid_from_commission' : ''}`)
    .eq('influencer_id', influencerId)
    .eq('payment_method', 'commission')
    .neq('status', 'cancelled')
  if (error) throw new Error(`commission spend lookup failed: ${error.message}`)
  return (data || []).reduce((s, r) => s + commissionPart(r), 0)
}

// Индивидуалната отстъпка на инфлуенсъра за заявки (null → тази от каталога)
export async function influencerDiscountPct(influencerId) {
  if (!(await productDiscountSupported())) return null
  const { data } = await supabaseAdmin
    .from('influencers').select('product_discount_pct').eq('id', influencerId).maybeSingle()
  const v = data?.product_discount_pct
  return v === null || v === undefined || v === '' ? null : Math.min(100, Math.max(0, Number(v)))
}

// Договорената цена/бр. на платените бройки — от самата заявка (paid_total), за да
// важи отстъпката към момента на заявяване, а не текущата в каталога.
export function agreedUnitPrice(r) {
  if (Number(r.paid_quantity) > 0) return Number(r.paid_total) / Number(r.paid_quantity)
  return Number(r.product?.price || 0) * (1 - Number(r.product?.paid_discount_pct || 0) / 100)
}
export function agreedDiscountPct(r) {
  const price = Number(r.product?.price || 0)
  if (!(price > 0) || !(Number(r.paid_quantity) > 0)) return Number(r.product?.paid_discount_pct || 0)
  return Math.round((1 - agreedUnitPrice(r) / price) * 100)
}
