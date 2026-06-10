# Multi-deployment + Shopify App Store — анализ

Запазен на 2026-06-10. Не е в active development — справка за стратегически избор.

---

## TL;DR

| Опция | Какво е | Време | Сложност |
|---|---|---|---|
| **A** | Прехвърляне на друг наш Shopify магазин | 1-2 дни | Ниска |
| **B** | Качване в Shopify App Store за publicи merchants | 2-4 месеца + app review | Много висока (rewrite) |

**Препоръка**: Ако стане въпрос за 2-3 наши магазина → A. Ако ще се продава на трети страни → B, но като нов проект, не като port на това.

---

## Сегашна архитектура (как е изградена сега)

- **Single-tenant**: едно Vercel deployment = един Shopify магазин = един Supabase. Няма `shop_id` концепт.
- **Shopify auth**: Private Custom App с фиксиран Admin API access token в env var (`SHOPIFY_ADMIN_ACCESS_TOKEN`). Без OAuth.
- **Standalone hosting**: `portal.realfood.bg` е отделен сайт, не embedded в Shopify Admin.
- **Email**: Microsoft Graph (Office 365), праща от `EMAIL_FROM_ADDRESS`.
- **DB**: Supabase Postgres, 18 миграции (`/supabase/migration_*.sql`).
- **Auth**: собствен username/password login + JWT в httpOnly cookie. Не Shopify session token.
- **Webhook**: Shopify orders → `/api/webhooks/shopify/orders` с HMAC валидация.

**Env vars (21)**:
```
ADMIN_NOTIFY_EMAIL, ADMIN_NOTIFY_EMAILS, ADMIN_PASSWORD, ADMIN_USERNAME,
AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID,
CRON_SECRET, EMAIL_FROM_ADDRESS, EMAIL_FROM_NAME,
JWT_SECRET, NEXT_PUBLIC_PORTAL_URL,
NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_STORE_DOMAIN, SHOPIFY_WEBHOOK_SECRET,
SHOP_BASE_URL, SHOP_DEFAULT_PATH
```

**Brand-hardcoded места** (14 файла): имейл темплейти, login страница, welcome email, реални имейли в default-ите. Конфигурируеми са logo + login bg през admin UI.

---

## Опция A: Прехвърляне на друг наш Shopify магазин

### Какво трябва

**1. Нови ресурси**
- [ ] Нов Supabase проект
- [ ] Нов Vercel проект
- [ ] Нов домейн (напр. `portal.example.com`)
- [ ] Shopify Custom App в новия магазин → Admin API access token
- [ ] Microsoft Graph creds за нов sender mailbox (или Resend/Postmark)

**2. Env vars за смяна** — всичките 21, повечето чрез копи-пейст с нови стойности

**3. Code промени (минимални)**
- Замяна на „RealFood" в имейл темплейти → `SHOP_BRAND_NAME` env var
- Login страница (title, favicon, мета)
- Welcome email subject + body
- Може и да го оставим конфигурируемо през admin UI (както branding-а вече работи)

**4. DB setup**
- Изпълнение на всичките 18 SQL миграции по ред в новия Supabase
- Първоначални admin записи (`influencers` table за admin user няма — admin е env-based)
- Branding запис (logo, login bg)

**5. Shopify конфигурация**
- Webhook за `orders/create` → `https://portal.example.com/api/webhooks/shopify/orders`
- API scopes:
  - `read_orders`, `write_orders` (за product requests → real orders)
  - `read_products` (за каталога за заявки)
  - `read_customers` (за shipping info при webhook)
  - `write_price_rules`, `read_price_rules` (ако генерираме discount codes)
  - `write_draft_orders` (legacy от draft order flow, не вече ползвано)

**6. Тест end-to-end**
- Създай тестов инфлуенсър
- Симулирай поръчка с промокода
- Провери webhook + click tracking
- Провери email flow

### Реална оценка

| Стъпка | Време |
|---|---|
| Setup на ресурси (Supabase, Vercel, домейн) | 2-3 часа |
| Env vars + Custom App setup в Shopify | 1-2 часа |
| Code rebrand (имейли, login, копи) | 2-4 часа |
| DB миграции + първоначален seed | 1 час |
| End-to-end тестване | 2-3 часа |

**Общо: 1-2 работни дни.**

---

## Опция B: Shopify App Store (за публични merchants)

Това не е port — това е **различен продукт**. Сегашният код покрива може би 30% от това, което е нужно. Архитектурата трябва да се промени фундаментално.

### Какво трябва (по приоритет)

**1. Multi-tenancy** (най-голямата работа)
- Всяка таблица получава `shop_id` (или `shop_domain`)
- Всеки запит се филтрира по текущия shop
- Storage пътищата — изолация per-shop
- Нова `shops` таблица + foreign keys навсякъде
- Setup flow при app install — auto-create на shop record

**2. Shopify OAuth flow** (вместо private token)
- `/api/auth/shopify/install` — започва OAuth grant flow
- `/api/auth/shopify/callback` — обработва code → access token, записва per-shop
- Session tokens с JWT (App Bridge подава)
- Token refresh logic

**3. Embedded app в Shopify Admin** (изискване)
- App работи **вътре в iframe-а на Shopify Admin**, не самостоятелно
- **App Bridge React** за communication с host Shopify
- **Polaris** (UI lib на Shopify) — повечето наши компоненти ще се пренапишат: header, navigation, modals, форми
- Това е значителен UI rewrite — нашият custom design system изобщо няма да съществува

**4. Billing API**
- За платена app — Shopify изисква charge-овете да минават през **техния** Billing API
- Subscription tiers (Basic / Pro / Enterprise), trial periods, usage-based ако трябва
- Cannot collect payment извън Shopify

**5. GDPR webhooks** (задължителни за approve)
- `customers/data_request` — какво пазим за този клиент
- `customers/redact` — изтрий клиента
- `shop/redact` — изтрий целия магазин (48ч след uninstall)
- Без тях app review **гарантирано** ще rejekне

**6. Производителност + сигурност**
- TTFB <500ms за главните screens
- HMAC валидация на всеки webhook (вече имаме)
- Без секрети в frontend
- Rate limit handling за Shopify API (вече имаме за orders sync)
- Penetration test responses от Shopify reviewer-ите

**7. Listing materials**
- App icon (1024×1024)
- Tagline (под 60 знака)
- Кратко + дълго описание
- 5-7 скрийншоти от различни ракурси
- Демо видео (препоръчително)
- Privacy policy + Terms of Service на собствен публичен домейн
- Demo store или login credentials за reviewer-ите

**8. App Review процес**
- Submit → 2-4 седмици преглед
- Често искат промени → нов submission → нови 2 седмици
- Често rejection reasons: scope creep, UX issues, missing GDPR webhooks, performance, billing not via API
- Pre-launch checklist от Shopify е дълъг

### Реалистичен подход за Опция B

**Не port-вай сегашното. Започни нов repo от** [Shopify App Template](https://github.com/Shopify/shopify-app-template-node) — официалният template (Remix или Node), който вече има OAuth, App Bridge, session token verification, и GDPR webhooks setup. Базирай го на това.

Какво се port-ва от текущото:
- ✅ Бизнес логика: calc на комисионна, payout flow, product requests, click tracking, leaderboard
- ✅ DB схеми (с добавен `shop_id`)
- ❌ Auth система (изхвърля се — Shopify OAuth)
- ❌ Frontend UI (изхвърля се — Polaris)
- ❌ Standalone hosting (embedded в Shopify Admin)
- ❌ Microsoft Graph (заменя се с по-универсален email provider — Resend/Postmark/Sendgrid)

### Реална оценка

| Стъпка | Време |
|---|---|
| Multi-tenant DB redesign + миграция | 1 седмица |
| Shopify OAuth + session management | 1 седмица |
| Полaris UI rewrite на admin страниците | 2-3 седмици |
| Полaris UI rewrite на influencer dashboard | 2 седмици |
| Billing API integration | 3-5 дни |
| GDPR webhooks + data retention policies | 2-3 дни |
| Performance optimization + security audit | 1 седмица |
| Listing materials (screenshots, video, copy) | 1 седмица |
| App review iterations | 1-2 месеца |

**Общо: 4-6 месеца code work + 1-2 месеца review iterations.**

---

## Какво аз мога/не мога да направя

| Задача | Мога? |
|---|---|
| Code, миграции, env setup — Опция A | ✅ Да, 1-2 дни |
| Code за multi-tenant + OAuth + Polaris UI — Опция B | ✅ Да, 4-6 седмици |
| Shopify Partner account + app submission | ❌ Не — ти трябва да го направиш |
| App review timeline | ❌ Не — зависи от Shopify reviewer-ите |
| Privacy policy + ToS legal documents | ❌ Не — нужен е юрист |
| App listing copy, screenshots, video | ⚠️ Мога да помогна с draft на текста, но screenshots/video — ти |
| Pricing decisions | ⚠️ Мога да предложа модели, но решението е твое |

---

## Решения, които трябва да вземеш преди да започнем

### За Опция A
1. Колко магазина смятате да деплойнете? Ако са 3+, може да си заслужава да направим конфигурируеми всички branding-и (запазваме single-tenant но с шаблон).
2. Един и същ email provider за всички, или различни?
3. Един и същ admin team или разделен per-shop?

### За Опция B
1. **Pricing model** — flat fee, percentage of payouts, tiered по brand size?
2. **Target market** — само BG/EU магазини? Глобално?
3. **Езиков обхват** — само български? Английски също? Други?
4. **Какво от текущите features е MVP за app store** — всичко или само core?
5. **Кой управлява app review** — ти, някой на твоя екип, или агенция?

---

## Hybrid опция (междинна)

Ако искате да продавате на 5-10 големи клиента без да минавате през Shopify App Store:

- Деплойвате го като white-label managed solution
- Всеки клиент получава свой Vercel + Supabase setup
- Ние (или ти) поддържаме всичко
- Зарежда се абонамент извън Shopify (директно фактуриране)
- Не минавате app review, не сте embedded в Shopify Admin

Това е по-бързо от B (защото запазваме архитектурата от A), но изисква operations setup за управление на много deployments. Може би 2-3 месеца, ако се изгради deploy/admin tooling.
