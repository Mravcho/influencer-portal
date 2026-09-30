import { supabaseAdmin } from './supabase'

// Имейли на екипа, които получават известия (кандидатури, изплащания, заявки
// за продукти, чат). Управляват се от Админ → Настройки (branding.notify_emails).
// Ако колоната още липсва или списъкът е празен → env ADMIN_NOTIFY_EMAILS.

const ENV_EMAILS = (process.env.ADMIN_NOTIFY_EMAILS || process.env.ADMIN_NOTIFY_EMAIL || 'pavel@realfood.bg')
  .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmails(list) {
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const e = String(raw || '').trim().toLowerCase()
    if (EMAIL_RE.test(e) && !out.includes(e)) out.push(e)
  }
  return out
}

// „Има я“ се помни; „няма я“ се проверява наново след минута (миграция без рестарт)
let columnSupport = null
let checkedAt = 0
export async function notifyEmailsColumnExists() {
  if (columnSupport === true || (columnSupport === false && Date.now() - checkedAt < 60 * 1000)) return columnSupport
  const { error } = await supabaseAdmin.from('branding').select('notify_emails').limit(1)
  columnSupport = !error
  checkedAt = Date.now()
  if (!columnSupport) console.warn('branding.notify_emails липсва — пусни supabase/migration_notify_emails.sql')
  return columnSupport
}

// Записаният в настройките списък (null ако колоната липсва или нищо не е записано)
export async function getSavedNotifyEmails() {
  if (!(await notifyEmailsColumnExists())) return null
  const { data } = await supabaseAdmin.from('branding').select('notify_emails').eq('id', 1).maybeSingle()
  const list = normalizeEmails(data?.notify_emails)
  return list.length ? list : null
}

// Списъкът, до който реално се праща: настройки → env
export async function getAdminNotifyEmails() {
  return (await getSavedNotifyEmails()) || ENV_EMAILS
}

export { ENV_EMAILS }
