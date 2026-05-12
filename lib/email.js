import 'isomorphic-fetch'
import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js'

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://your-portal.vercel.app'

// Client credentials flow – app-only, без user login
// Изисква Mail.Send application permission в Azure Entra ID
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

/**
 * Изпраща нотификация до инфлуенсъра при нова поръчка.
 * Използва Microsoft Graph API – POST /users/{sender}/sendMail
 */
export async function sendNewOrderNotification({ to, name, promoCode, newOrders, commission }) {
  const firstName  = name.split(' ')[0]
  const fromAddr   = process.env.EMAIL_FROM_ADDRESS
  const fromName   = process.env.EMAIL_FROM_NAME || 'Influencer Portal'

  const subject = newOrders === 1
    ? `🛍️ Имаш нова поръчка с код ${promoCode}!`
    : `🛍️ Имаш ${newOrders} нови поръчки с код ${promoCode}!`

  const message = {
    subject,
    body: {
      contentType: 'HTML',
      content: buildEmailHtml({ firstName, promoCode, newOrders, commission }),
    },
    from: {
      emailAddress: { address: fromAddr, name: fromName },
    },
    toRecipients: [
      { emailAddress: { address: to, name } },
    ],
  }

  const client = getGraphClient()

  // Изпращаме от конкретния mailbox чрез /users/{email}/sendMail
  // Изисква Mail.Send application permission (не delegated)
  await client
    .api(`/users/${fromAddr}/sendMail`)
    .post({ message, saveToSentItems: true })
}

function buildEmailHtml({ firstName, promoCode, newOrders, commission }) {
  const ordersText = newOrders === 1 ? 'нова поръчка' : `${newOrders} нови поръчки`

  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <tr>
          <td align="center" style="padding-bottom:28px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#E1F5EE;border-radius:12px;padding:10px 14px;">
                <span style="font-size:22px;">✦</span>
              </td>
              <td style="padding-left:10px;">
                <span style="font-size:15px;font-weight:700;color:#1a1a18;">Influencer Portal</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;border-radius:16px;border:1px solid #e8e6e0;padding:36px 40px;">

            <p style="margin:0 0 6px;font-size:13px;color:#6b6b68;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">
              Здравей, ${firstName} 👋
            </p>
            <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#1a1a18;line-height:1.2;">
              Имаш ${ordersText}<br>с твоя код!
            </h1>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#f8f7f4;border:1px solid #e8e6e0;border-radius:8px;padding:10px 16px;">
                  <span style="font-size:11px;color:#6b6b68;font-weight:600;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">Промокод</span>
                  <span style="font-size:20px;font-weight:700;color:#1a1a18;letter-spacing:1px;font-family:monospace;">${promoCode}</span>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.6;">
              Клиент е използвал твоя промокод и е направил поръчка в магазина.
              Влез в портала, за да видиш <strong>кои продукти са поръчани</strong>
              и каква е <strong>твоята комисионна от ${commission}%</strong>.
            </p>

            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="${PORTAL_URL}/dashboard"
                   style="display:inline-block;background:#1D9E75;color:#ffffff;font-size:15px;
                          font-weight:600;text-decoration:none;padding:14px 36px;
                          border-radius:10px;">
                  Виж поръчката →
                </a>
              </td></tr>
            </table>

            <table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
              <tr><td style="border-top:1px solid #e8e6e0;"></td></tr>
            </table>

            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="background:#E6F1FB;border-radius:8px;padding:12px 16px;">
                  <p style="margin:0;font-size:13px;color:#185FA5;line-height:1.5;">
                    🔒 <strong>Поверителност:</strong> В портала можеш да видиш поръчаните продукти
                    и стойността на поръчките — без лични данни на клиентите.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 0 0;">
            <p style="margin:0 0 6px;font-size:12px;color:#9b9b98;">
              Получаваш този мейл, защото имаш активен промокод в нашия магазин.
            </p>
            <p style="margin:0;font-size:12px;color:#9b9b98;">
              За да спреш нотификациите, свържи се с администратора.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}


function buildEmailHtml({ firstName, promoCode, newOrders, commission }) {
  const ordersText = newOrders === 1 ? 'нова поръчка' : `${newOrders} нови поръчки`

  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Нова поръчка</title>
</head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#E1F5EE;border-radius:12px;padding:10px 14px;">
                    <span style="font-size:22px;">✦</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="font-size:15px;font-weight:700;color:#1a1a18;letter-spacing:-0.3px;">Influencer Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e8e6e0;padding:36px 40px;">

              <p style="margin:0 0 6px;font-size:13px;color:#6b6b68;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">
                Здравей, ${firstName} 👋
              </p>
              <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#1a1a18;line-height:1.2;">
                Имаш ${ordersText}<br>с твоя код!
              </h1>

              <!-- Promo code badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f8f7f4;border:1px solid #e8e6e0;border-radius:8px;padding:10px 16px;">
                    <span style="font-size:11px;color:#6b6b68;font-weight:600;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">Промокод</span>
                    <span style="font-size:20px;font-weight:700;color:#1a1a18;letter-spacing:1px;font-family:monospace;">${promoCode}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.6;">
                Клиент е използвал твоя промокод и е направил поръчка в магазина.
                Влез в портала, за да видиш <strong>кои продукти са поръчани</strong>
                и каква е <strong>твоята комисионна от ${commission}%</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${PORTAL_URL}/dashboard"
                       style="display:inline-block;background:#1D9E75;color:#ffffff;font-size:15px;
                              font-weight:600;text-decoration:none;padding:14px 36px;
                              border-radius:10px;letter-spacing:-0.2px;">
                      Виж поръчката →
                    </a>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
                <tr><td style="border-top:1px solid #e8e6e0;"></td></tr>
              </table>

              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="background:#E6F1FB;border-radius:8px;padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#185FA5;line-height:1.5;">
                      🔒 <strong>Поверителност:</strong> В портала можеш да видиш поръчаните продукти
                      и стойността на поръчките — без лични данни на клиентите.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0 0 6px;font-size:12px;color:#9b9b98;">
                Получаваш този мейл, защото имаш активен промокод в нашия магазин.
              </p>
              <p style="margin:0;font-size:12px;color:#9b9b98;">
                За да спреш нотификациите, свържи се с администратора.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}


function buildEmailHtml({ firstName, promoCode, newOrders, commission }) {
  const ordersText = newOrders === 1 ? 'нова поръчка' : `${newOrders} нови поръчки`

  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Нова поръчка</title>
</head>
<body style="margin:0;padding:0;background:#f8f7f4;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#E1F5EE;border-radius:12px;padding:10px 14px;">
                    <span style="font-size:22px;">✦</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="font-size:15px;font-weight:700;color:#1a1a18;letter-spacing:-0.3px;">Influencer Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e8e6e0;padding:36px 40px;">

              <!-- Greeting -->
              <p style="margin:0 0 6px;font-size:13px;color:#6b6b68;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">
                Здравей, ${firstName} 👋
              </p>
              <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#1a1a18;line-height:1.2;">
                Имаш ${ordersText}<br>с твоя код!
              </h1>

              <!-- Promo code badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f8f7f4;border:1px solid #e8e6e0;border-radius:8px;padding:10px 16px;">
                    <span style="font-size:11px;color:#6b6b68;font-weight:600;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px;">Промокод</span>
                    <span style="font-size:20px;font-weight:700;color:#1a1a18;letter-spacing:1px;font-family:monospace;">${promoCode}</span>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin:0 0 28px;font-size:15px;color:#444;line-height:1.6;">
                Клиент е използвал твоя промокод и е направил поръчка в магазина.
                Влез в портала, за да видиш <strong>кои продукти са поръчани</strong>
                и каква е <strong>твоята комисионна от ${commission}%</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${PORTAL_URL}/dashboard"
                       style="display:inline-block;background:#1D9E75;color:#ffffff;font-size:15px;
                              font-weight:600;text-decoration:none;padding:14px 36px;
                              border-radius:10px;letter-spacing:-0.2px;">
                      Виж поръчката →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
                <tr><td style="border-top:1px solid #e8e6e0;"></td></tr>
              </table>

              <!-- Info note -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="background:#E6F1FB;border-radius:8px;padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#185FA5;line-height:1.5;">
                      🔒 <strong>Поверителност:</strong> В портала можеш да видиш поръчаните продукти
                      и стойността на поръчките — без лични данни на клиентите.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0 0 6px;font-size:12px;color:#9b9b98;">
                Получаваш този мейл, защото имаш активен промокод в нашия магазин.
              </p>
              <p style="margin:0;font-size:12px;color:#9b9b98;">
                За да спреш нотификациите, свържи се с администратора.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}
