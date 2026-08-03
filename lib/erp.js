// Интеграция с ERP — автоматично качване на разходна фактура през AI разчитане.
// POST https://erp.realfood.bg/api/integrations/expenses/ai
// Ключът се държи само сървър-към-сървър (env), НЕ в браузър/репо.

const ERP_URL = process.env.EXPENSE_ERP_URL || 'https://erp.realfood.bg/api/integrations/expenses/ai'
const ERP_KEY = process.env.EXPENSE_ERP_API_KEY

// Праща линк към фактурата (PDF/снимка/Excel). ERP AI я разчита и създава разхода.
// По подразбиране разходът е НЕПЛАТЕН (за преглед в ERP преди плащане).
// Връща нормализиран резултат — не хвърля, за да не блокира одобрението.
export async function createExpenseFromInvoiceUrl(documentUrl, opts = {}) {
  if (!ERP_KEY) return { ok: false, error: 'Липсва EXPENSE_ERP_API_KEY (env)' }
  if (!documentUrl) return { ok: false, error: 'Липсва documentUrl' }

  try {
    const res = await fetch(ERP_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ERP_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentUrl, ...opts }),
    })
    const data = await res.json().catch(() => ({}))

    if (res.status === 200) {
      return { ok: true, id: data.id || null, parsed: data.parsed || null, warning: data.warning || null }
    }
    if (res.status === 409) {
      // Вече качена (проверка по № + доставчик) — броим я за успех, пазим съществуващото ID
      return { ok: true, duplicate: true, id: data.existingId || null, warning: 'Вече качена в ERP (дубликат)' }
    }
    if (res.status === 422) return { ok: false, status: 422, error: 'ERP AI не разчете фактурата/сумата' }
    if (res.status === 401) return { ok: false, status: 401, error: 'ERP: невалиден ключ' }
    return { ok: false, status: res.status, error: data.error || data.message || `ERP грешка ${res.status}` }
  } catch (err) {
    return { ok: false, error: `ERP връзка: ${err.message}` }
  }
}
