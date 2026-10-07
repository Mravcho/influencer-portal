// Фактурата към изплащане трябва да е файл, качен през портала за СЪЩИЯ инфлуенсър
// (branding/invoices/<influencerId>/…). Иначе някой може да подаде произволен
// линк, който при одобрение отива към ERP-то за разчитане.
export function isOwnInvoiceUrl(url, influencerId) {
  const u = String(url || '')
  if (!u || !influencerId) return false
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/invoices/${influencerId}/`
  if (!u.startsWith(base)) return false
  const rest = u.slice(base.length)
  // само име на файл — без поддиректории, „..“, параметри
  return rest.length > 0 && !/[\/?#\\]/.test(rest) && !rest.includes('..')
}
