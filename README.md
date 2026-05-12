# Influencer Portal

Портал за инфлуенсъри – проследяване на поръчки от Shopify по промокод.

## Стек
- **Next.js 14** (App Router) – frontend + API routes
- **Supabase** – PostgreSQL база данни (не заспива)
- **Vercel** – hosting + cron job за автоматичен sync
- **Shopify Admin API** – извличане на поръчки по discount code
- **Resend** – мейл нотификации (безплатно до 3 000/месец)

---

## 1. Supabase – настройка

1. Създай нов проект на [supabase.com](https://supabase.com)
2. Отвори **SQL Editor → New query**
3. Изпълни `supabase/schema.sql`, след това `supabase/migration_add_email.sql`
4. Запази от **Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Microsoft Graph API – настройка на Azure App Registration

Graph API изисква регистриран app в Azure Entra ID с `Mail.Send` **application** permission (не delegated — работи без логнат потребител).

### Стъпка по стъпка

**1. Регистрирай app**
- Отвори [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
- Name: `Influencer Portal`
- Supported account types: **Accounts in this organizational directory only**
- Redirect URI: остави празно → **Register**

**2. Запази Tenant ID и Client ID**
- От Overview копирай:
  - `Application (client) ID` → `AZURE_CLIENT_ID`
  - `Directory (tenant) ID` → `AZURE_TENANT_ID`

**3. Създай Client Secret**
- **Certificates & secrets** → **New client secret**
- Description: `influencer-portal-prod`, Expires: 24 months
- Копирай **Value** веднага (показва се само веднъж) → `AZURE_CLIENT_SECRET`

**4. Добави Mail.Send permission**
- **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
- Намери и избери `Mail.Send` ✅ → **Add permissions**
- **Grant admin consent for [твоя tenant]** → Yes ✅
  *(без admin consent мейлите няма да работят)*

**5. Добави env vars**
```
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=your_secret_value
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=Influencer Portal
NEXT_PUBLIC_PORTAL_URL=https://your-portal.vercel.app
```

> `EMAIL_FROM_ADDRESS` трябва да е реален M365 mailbox в твоя tenant.
> App-only `Mail.Send` може да изпраща от всеки mailbox в организацията.

---

## 3. Shopify – Admin API Token

1. В Shopify Admin: **Settings → Apps → Develop apps**
2. Create app → Configure Admin API scopes:
   - `read_orders` ✅
   - `read_discounts` ✅
3. Install app → копирай **Admin API access token**
4. Запази:
   - Store domain: `your-store.myshopify.com` → `SHOPIFY_STORE_DOMAIN`
   - Token → `SHOPIFY_ADMIN_ACCESS_TOKEN`

---

## 3. Локално стартиране

```bash
git clone https://github.com/your-org/influencer-portal
cd influencer-portal
npm install

cp .env.example .env.local
# Попълни всички стойности в .env.local

npm run dev
```

Отвори http://localhost:3000

---

## 4. Deploy на Vercel

```bash
# Инсталирай Vercel CLI
npm i -g vercel

# Deploy
vercel

# Добави environment variables в Vercel Dashboard:
# Settings → Environment Variables
# (всички от .env.example)

# Добави CRON_SECRET за защита на cron job-а
CRON_SECRET=random_secret_string_here
```

Vercel автоматично ще изпълнява `POST /api/admin/sync` всеки час (виж `vercel.json`).

---

## 5. Добавяне на инфлуенсър

**Option A – Admin UI** (препоръчително):
1. Отвори `https://your-site.vercel.app/login`
2. Влез с admin credentials от `.env.local`
3. Admin панел → "Добави нов"

**Option B – директно в Supabase**:
```sql
-- Генерирай bcrypt hash на паролата първо (напр. с https://bcrypt-generator.com)
INSERT INTO influencers (name, username, password_hash, promo_code, commission, platform)
VALUES ('Мария Иванова', 'maria', '$2a$10$...', 'MARIA15', 15, 'Instagram');
```

---

## 6. Ръчен Shopify Sync

От Admin панела → бутон **"⟳ Sync всички"** или бутонът до всеки инфлуенсър.

---

## Структура на проекта

```
app/
  api/
    auth/login/       → POST login (influencer + admin)
    auth/logout/      → POST logout
    auth/me/          → GET current user info
    dashboard/orders/ → GET orders за логнатия инфлуенсър
    admin/influencers/ → CRUD за инфлуенсъри (само admin)
    admin/sync/       → POST Shopify sync (admin + cron)
  login/              → Login страница
  dashboard/          → Influencer dashboard
  admin/              → Admin панел
lib/
  supabase.js         → Supabase клиент
  shopify.js          → Shopify Admin API (анонимизиране на данни)
  auth.js             → JWT helpers
middleware.js         → Route protection
supabase/
  schema.sql          → Цялата DB схема
```

---

## Сигурност

- Паролите се хешират с **bcrypt** (cost 10)
- Сесиите са **HTTP-only JWT cookies** (7 дни)
- Инфлуенсърите виждат САМО собствените си поръчки (филтриране по `influencer_id`)
- **Никакви лични данни на клиенти** не се записват – `lib/shopify.js` ги филтрира при извличане
- Supabase Row Level Security е активиран
