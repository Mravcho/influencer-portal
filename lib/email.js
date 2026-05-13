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
