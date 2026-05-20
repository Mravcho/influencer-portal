import 'isomorphic-fetch'
import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://your-portal.vercel.app'

// Конвертира `to` (string или string[]) в Microsoft Graph toRecipients масив
function toRecipientsList(to) {
  const list = Array.isArray(to) ? to : [to]
  return list.filter(Boolean).map(addr => ({ emailAddress: { address: addr } }))
}

function getGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET,
  )
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  })
  return Client.initWithMiddleware({ authProvider })
}

export async function sendWelcomeEmail({ to, name, promoCode, resetUrl }) {
  const firstName = name.split(' ')[0]
  const fromAddr  = process.env.EMAIL_FROM_ADDRESS
  const fromName  = process.env.EMAIL_FROM_NAME || 'RealFood Influencer Portal'
  const subject   = `Добре дошъл/а в RealFood Influencer Portal!`
  const message = {
    subject,
    body: { contentType: 'HTML', content: buildWelcomeHtml({ firstName, promoCode, resetUrl }) },
    from: { emailAddress: { address: fromAddr, name: fromName } },
    toRecipients: [{ emailAddress: { address: to, name } }],
  }
  const client = getGraphClient()
  await client.api(`/users/${fromAddr}/sendMail`).post({ message, saveToSentItems: true })
}

function buildWelcomeHtml({ firstName, promoCode, resetUrl }) {
  return `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0">
        <tr><td style="background:#fff;border-radius:16px;border:1px solid #e8e6e0;padding:36px 40px;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b6b68;">Здравей, ${firstName} 👋</p>
          <h1 style="margin:0 0 16px;font-size:26px;color:#1a1a18;">Добре дошъл/а в RealFood!</h1>

          <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6;">
            Радваме се че си с нас. Създадохме ти профил в нашия портал, където можеш да следиш в реално време:
          </p>

          <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#444;line-height:1.8;">
            <li><strong>Поръчки</strong> направени с твоя промокод — анонимизирани, без лични данни на клиентите</li>
            <li><strong>Комисионна</strong> — изчислява се автоматично от пълната цена на продуктите</li>
            <li><strong>Топ продукти</strong> със снимки — кое се продава най-много</li>
            <li><strong>Класация</strong> — мястото ти спрямо другите инфлуенсъри за месеца</li>
            <li><strong>Изплащане</strong> — заявка за изплащане при натрупани минимум 100 €</li>
          </ul>

          <p style="margin:0 0 8px;font-size:11px;color:#6b6b68;text-transform:uppercase;">Твоят промокод</p>
          <p style="margin:0 0 24px;font-size:20px;font-weight:700;font-family:monospace;">${promoCode}</p>

          <p style="margin:0 0 14px;font-size:15px;color:#444;line-height:1.6;">
            За да активираш профила си, задай <strong>своя парола</strong>:
          </p>

          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${resetUrl}"
                 style="display:inline-block;background:#1D9E75;color:#fff;font-size:15px;
                        font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;">
                Задай парола →
              </a>
            </td></tr>
          </table>

          <p style="margin:24px 0 0;font-size:11px;color:#6b6b68;line-height:1.5;text-align:center;">
            Линкът е валиден 7 дни. Ако не си очаквал/а този имейл, можеш да го игнорираш.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const firstName = name.split(' ')[0]
  const fromAddr  = process.env.EMAIL_FROM_ADDRESS
  const fromName  = process.env.EMAIL_FROM_NAME || 'RealFood Influencer Portal'
  const subject   = `Смяна на парола в RealFood Portal`
  const message = {
    subject,
    body: {
      contentType: 'HTML',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;background:#f8f7f4;">
        <div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:36px;">
          <p style="font-size:13px;color:#6b6b68;">Здравей, ${firstName}</p>
          <h1 style="font-size:22px;margin:8px 0 16px;">Заявка за смяна на парола</h1>
          <p style="font-size:14px;color:#444;line-height:1.6;">Кликни върху бутона за да зададеш нова парола:</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#1D9E75;color:#fff;
              text-decoration:none;padding:12px 32px;border-radius:10px;font-weight:600;">Смени паролата →</a>
          </p>
          <p style="font-size:11px;color:#6b6b68;text-align:center;">Линкът е валиден 1 час. Ако не си правил/а заявка — игнорирай този имейл.</p>
        </div></body></html>`,
    },
    from: { emailAddress: { address: fromAddr, name: fromName } },
    toRecipients: [{ emailAddress: { address: to, name } }],
  }
  const client = getGraphClient()
  await client.api(`/users/${fromAddr}/sendMail`).post({ message, saveToSentItems: true })
}

export async function sendApplicationEmail({ to, adminPortalUrl, application }) {
  const fromAddr = process.env.EMAIL_FROM_ADDRESS
  const fromName = process.env.EMAIL_FROM_NAME || 'RealFood Influencer Portal'
  const subject  = `📨 Нова заявка за инфлуенсър: ${application.full_name}`

  const socialRows = [
    ['Instagram', application.instagram_url],
    ['TikTok',    application.tiktok_url],
    ['Facebook',  application.facebook_url],
    ['YouTube',   application.youtube_url],
    ['Друга',     application.other_url],
  ].filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#6b6b68;">${k}:</td><td style="padding:6px 0;text-align:right;"><a href="${v}" style="color:#1D9E75;">${v}</a></td></tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8f7f4;padding:40px 16px;">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e8e6e0;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b6b68;margin:0 0 4px;">Нова заявка за инфлуенсър</p>
      <h1 style="font-size:24px;color:#1a1a18;margin:0 0 18px;">${application.full_name}</h1>

      <table style="width:100%;font-size:14px;color:#444;border-collapse:collapse;margin-bottom:18px;">
        <tr><td style="padding:6px 0;color:#6b6b68;">Имейл:</td><td style="padding:6px 0;text-align:right;"><a href="mailto:${application.email}" style="color:#1D9E75;">${application.email}</a></td></tr>
        ${application.phone ? `<tr><td style="padding:6px 0;color:#6b6b68;">Телефон:</td><td style="padding:6px 0;text-align:right;"><a href="tel:${application.phone}" style="color:#1D9E75;">${application.phone}</a></td></tr>` : ''}
        ${socialRows}
      </table>

      ${application.motivation ? `
        <div style="background:#f8f7f4;border-radius:10px;padding:14px;margin-bottom:18px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b6b68;margin-bottom:6px;">Мотивация</div>
          <div style="font-size:14px;color:#1a1a18;white-space:pre-line;">${application.motivation}</div>
        </div>
      ` : ''}

      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td align="center">
          <a href="${adminPortalUrl}/admin/applications"
             style="display:inline-block;background:#1D9E75;color:#fff;font-size:15px;font-weight:600;
                    text-decoration:none;padding:12px 32px;border-radius:10px;">
            Виж заявката →
          </a>
        </td></tr>
      </table>
    </div></body></html>`

  const client = getGraphClient()
  await client.api(`/users/${fromAddr}/sendMail`).post({
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      from: { emailAddress: { address: fromAddr, name: fromName } },
      toRecipients: toRecipientsList(to),
    },
    saveToSentItems: true,
  })
}

export async function sendPayoutRequestEmail({ to, adminPortalUrl, influencerName, promoCode, amount, notes }) {
  const fromAddr  = process.env.EMAIL_FROM_ADDRESS
  const fromName  = process.env.EMAIL_FROM_NAME || 'RealFood Influencer Portal'
  const subject   = `💸 Нова заявка за изплащане: ${influencerName} — ${Number(amount).toFixed(2)} €`
  const message = {
    subject,
    body: {
      contentType: 'HTML',
      content: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8f7f4;padding:40px 16px;">
        <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e8e6e0;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b6b68;margin:0 0 4px;">Нова заявка за изплащане</p>
          <h1 style="font-size:24px;color:#1a1a18;margin:0 0 18px;">${influencerName}</h1>

          <table style="width:100%;font-size:14px;color:#444;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:6px 0;color:#6b6b68;">Промокод:</td><td style="padding:6px 0;font-family:monospace;font-weight:700;text-align:right;">${promoCode}</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b68;">Сума:</td><td style="padding:6px 0;font-weight:700;font-size:18px;color:#0F6E56;text-align:right;">${Number(amount).toFixed(2)} €</td></tr>
            ${notes ? `<tr><td style="padding:6px 0;color:#6b6b68;vertical-align:top;">Бележка:</td><td style="padding:6px 0;text-align:right;">${notes}</td></tr>` : ''}
          </table>

          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${adminPortalUrl}/admin/payouts"
                 style="display:inline-block;background:#1D9E75;color:#fff;font-size:15px;font-weight:600;
                        text-decoration:none;padding:12px 32px;border-radius:10px;">
                Виж в админ панела →
              </a>
            </td></tr>
          </table>
        </div></body></html>`,
    },
    from: { emailAddress: { address: fromAddr, name: fromName } },
    toRecipients: toRecipientsList(to),
  }
  const client = getGraphClient()
  await client.api(`/users/${fromAddr}/sendMail`).post({ message, saveToSentItems: true })
}

// Известие към admin за нова заявка от инфлуенсър за продукт
export async function sendProductRequestEmail({ to, adminPortalUrl, influencerName, promoCode, productName, quantity, freeQty, paidQty, paidTotal }) {
  const fromAddr = process.env.EMAIL_FROM_ADDRESS
  const fromName = process.env.EMAIL_FROM_NAME || 'RealFood Influencer Portal'
  const subject  = `🎁 Нова заявка за продукт: ${influencerName} — ${productName}`

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8f7f4;padding:40px 16px;">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e8e6e0;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b6b68;margin:0 0 4px;">Заявка за продукт</p>
      <h1 style="font-size:24px;color:#1a1a18;margin:0 0 18px;">${influencerName}</h1>

      <table style="width:100%;font-size:14px;color:#444;border-collapse:collapse;margin-bottom:18px;">
        <tr><td style="padding:6px 0;color:#6b6b68;">Промокод:</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${promoCode}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6b68;">Продукт:</td><td style="padding:6px 0;text-align:right;font-weight:600;">${productName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b6b68;">Общо кол-во:</td><td style="padding:6px 0;text-align:right;">${quantity} бр.</td></tr>
        <tr><td style="padding:6px 0;color:#6b6b68;">Безплатно:</td><td style="padding:6px 0;text-align:right;">${freeQty} бр.</td></tr>
        <tr><td style="padding:6px 0;color:#6b6b68;">Платено:</td><td style="padding:6px 0;text-align:right;">${paidQty} бр.</td></tr>
        <tr><td style="padding:6px 0;color:#6b6b68;">Сума за плащане:</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1D9E75;">${Number(paidTotal).toFixed(2)} €</td></tr>
      </table>

      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td align="center">
          <a href="${adminPortalUrl}/admin/product-requests"
             style="display:inline-block;background:#1D9E75;color:#fff;font-size:15px;font-weight:600;
                    text-decoration:none;padding:12px 32px;border-radius:10px;">
            Виж заявката →
          </a>
        </td></tr>
      </table>
    </div></body></html>`

  const client = getGraphClient()
  await client.api(`/users/${fromAddr}/sendMail`).post({
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      from: { emailAddress: { address: fromAddr, name: fromName } },
      toRecipients: toRecipientsList(to),
    },
    saveToSentItems: true,
  })
}

export async function sendNewOrderNotification({ to, name, promoCode, newOrders, commission }) {
  const firstName = name.split(' ')[0]
  const fromAddr  = process.env.EMAIL_FROM_ADDRESS
  const fromName  = process.env.EMAIL_FROM_NAME || 'RealFood Influencer Portal'
  const subject = newOrders === 1
    ? `Имаш нова поръчка с код ${promoCode}!`
    : `Имаш ${newOrders} нови поръчки с код ${promoCode}!`
  const message = {
    subject,
    body: { contentType: 'HTML', content: buildEmailHtml({ firstName, promoCode, newOrders, commission }) },
    from: { emailAddress: { address: fromAddr, name: fromName } },
    toRecipients: [{ emailAddress: { address: to, name } }],
  }
  const client = getGraphClient()
  await client.api(`/users/${fromAddr}/sendMail`).post({ message, saveToSentItems: true })
}

function buildEmailHtml({ firstName, promoCode, newOrders, commission }) {
  const ordersText = newOrders === 1 ? 'нова поръчка' : `${newOrders} нови поръчки`
  return `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0">
        <tr><td style="background:#fff;border-radius:16px;border:1px solid #e8e6e0;padding:36px 40px;">
          <p style="margin:0 0 6px;font-size:13px;color:#6b6b68;">Здравей, ${firstName} 👋</p>
          <h1 style="margin:0 0 20px;font-size:26px;color:#1a1a18;">Имаш ${ordersText} с твоя код!</h1>
          <p style="margin:0 0 8px;font-size:11px;color:#6b6b68;text-transform:uppercase;">Промокод</p>
          <p style="margin:0 0 24px;font-size:20px;font-weight:700;font-family:monospace;">${promoCode}</p>
          <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.6;">
            Влез в портала за да видиш <strong>кои продукти са поръчани</strong>
            и каква е <strong>твоята комисионна от ${commission}%</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${PORTAL_URL}/dashboard"
                 style="display:inline-block;background:#1D9E75;color:#fff;font-size:15px;
                        font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;">
                Виж поръчката →
              </a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
