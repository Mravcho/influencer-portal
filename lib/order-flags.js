// Чисти помощни функции за статуса на поръчка — без зависимости, за да могат
// да се ползват и от lib/shopify.js, и от lib/order-status.js без цикъл.

// Статуси, при които поръчката не носи комисионна.
export const VOIDED_STATUSES = new Set(['voided', 'refunded'])

// Анулирана поръчка не винаги става 'voided' в Shopify: ако е била платена и
// няма издаден рефанд, financial_status остава 'paid'. Нормализираме я до
// 'voided', за да отпадне от комисионните навсякъде в портала.
export function normalizeFinancialStatus(financialStatus, cancelledAt) {
  const fin = (financialStatus || '').toLowerCase()
  if (!cancelledAt) return fin
  if (fin === 'refunded' || fin === 'partially_refunded') return fin
  return 'voided'
}

// Единно правило „не носи комисионна“ — по статус или по анулиране.
export function isVoidedOrder(order) {
  return VOIDED_STATUSES.has(order?.financial_status) || !!order?.cancelled_at
}
