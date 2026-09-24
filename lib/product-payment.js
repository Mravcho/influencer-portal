import { supabaseAdmin } from './supabase'

// Плащане на заявка за продукт с изкараната комисионна (product_requests.payment_method):
//   'self'       — инфлуенсърът плаща сам (досегашното поведение)
//   'commission' — сумата се приспада от баланса му за теглене
// Докато колоната липсва (миграцията не е пусната), опцията просто не се показва.

let supported = null
export async function productPaymentSupported() {
  if (supported !== null) return supported
  const { error } = await supabaseAdmin.from('product_requests').select('payment_method').limit(1)
  supported = !error
  if (!supported) console.warn('product_requests.payment_method липсва — пусни supabase/migration_product_payment.sql')
  return supported
}

// Колко от комисионната е „похарчено“ за продукти — всяка неотказана заявка,
// платена от баланса. Сумата следва paid_total, така че ако админът промени
// цената при създаване на поръчката, резервираното се коригира само.
export async function commissionSpentOnProducts(influencerId) {
  if (!(await productPaymentSupported())) return 0
  const { data, error } = await supabaseAdmin
    .from('product_requests')
    .select('paid_total')
    .eq('influencer_id', influencerId)
    .eq('payment_method', 'commission')
    .neq('status', 'cancelled')
  if (error) throw new Error(`commission spend lookup failed: ${error.message}`)
  return (data || []).reduce((s, r) => s + (Number(r.paid_total) || 0), 0)
}
