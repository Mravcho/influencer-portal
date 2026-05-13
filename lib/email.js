import 'isomorphic-fetch'
import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://your-portal.vercel.app'

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
