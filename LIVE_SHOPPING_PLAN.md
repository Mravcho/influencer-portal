# Live Shopping — план за реализация

Запазен на 2026-05-20. Не е в active development — кога стартираме се решава отделно.

---

## Целева функционалност

Инфлуенсърите да могат да правят live shopping стрийми от платформата — с чат в реално време, продукти, които се появяват на екрана по време на стрийма, и опция „Купи сега" без зрителят да губи стрийма.

---

## Вход (отговори от user-а)

| Параметър | Стойност |
|---|---|
| Паралелни зрители на стрийм | До 100 |
| Latency | Броудкаст 5-15с (HLS) |
| MVP scope | Schedule + viewer page · Live chat · Product overlays + „Купи сега" |
| Viewer auth | Анонимно по подразбиране; при желание за покупка → акаунт + запазване на шипинг + карта |
| COD | Опция засега, може да се махне |

---

## Архитектура

### Видео
**Препоръчан провайдър: Mux Live** (HLS, 3-10с latency).
- Цена: ~$0.01/мин encoding + $0.01/мин/зрител delivery
- 100 зрители × 60 мин ≈ **$1.20 на стрийм**
- Auto-recording за VOD по-късно

Алтернатива: **Cloudflare Stream Live** — по-евтино на скала ($1/1000 min encoded), малко по-беден DX.

### Чат
**Supabase Realtime** канал per-stream. Без extra инфраструктура — вече сме на Supabase.
- Анонимни никове (зрителят въвежда ник при влизане)
- Admin + инфлуенсърът модерират (delete message, ban nick за конкретния стрийм)

### „Купи сега" — ОТВОРЕНА ТОЧКА
Изискването „зрителят трябва да си въведе шипинг + плащане преди да купи" се препокрива с това, което Shopify Shop Pay вече прави.

**Препоръка**: Shopify checkout в slide-over панел вдясно на видеото:
- Един клик → продуктът отива в Shopify cart с приложен промокод на инфлуенсъра
- Shop Pay автоматично запазва карти и адреси (втората покупка става един клик)
- COD се конфигурира в Shopify, виждаме го като обикновена поръчка
- Нула PCI compliance, нула обработка на карти от наша страна
- Виждаме всички поръчки през съществуващия webhook `/api/webhooks/shopify/orders`

**Алтернатива (избягвай освен ако наистина трябва)**: собствен payment UI с Stripe Elements + Shopify Draft Order. Това е седмици допълнителна работа + PCI scope + дублира това, което Shopify дава out-of-the-box.

> **Решение на user-а: TBD** — оставяме отворено докато се обмисли.

### Атрибуция
Нова колона `live_stream_id` в `orders` (nullable). Когато viewer кликне „Купи сега" от live page, в Shopify cart attribute се добавя `live_stream_id` → webhook-ът го копира в orders при receive. Така виждаме коя поръчка е дошла от кой стрийм.

---

## Фази

### Phase 1 — Schedule + viewer page (без видео)
- DB schema: `live_streams` (id, slug, title, scheduled_at, status, influencer_id, mux_stream_id, mux_playback_id, started_at, ended_at)
- Admin/influencer UI за schedule на стрийм
- Public `/live/[slug]` page (placeholder за видеото)
- Чат-ът работи без видео — инфлуенсърът тества flow-а в брандиран dev режим
- Realtime chat backend + UI

### Phase 2 — Mux integration
- Mux API setup + env vars
- „GoLive" бутон в инфлуенсърския dashboard
- Stream key показва се на инфлуенсъра (за OBS / mobile encoder)
- HLS player (`hls.js` или Mux's own React player) на viewer page-а
- Live status badge („● На живо" / „⏸ Скоро") + viewer count

### Phase 3 — Product overlays + „Купи сега"
- Инфлуенсърът пинва продукт от каталога си (request_products + share_links + Shopify products) → се показва карта на зрителите
- Клик → Shopify checkout slide-over (ако одобрен този подход)
- Атрибуция: `live_stream_id` в orders → webhook → admin dashboard вижда колко поръчки идват от всеки стрийм

### Phase 4 (post-MVP)
- VOD replay (Mux записва автоматично)
- Moderation tools (ban list, slow mode)
- Schedule notifications (email + push към инфлуенсърите когато стрийм започва)
- Post-event analytics (peak viewers, avg watch time, conversion rate)

---

## Отворени въпроси / решения за по-късно

1. **Payment flow финален дизайн** — Shopify checkout slide-over vs собствен payment UI
2. **Mux API ключове** — когато стигнем Phase 2
3. **Кой може да стрийма** — всеки инфлуенсър или само избрани?
4. **Стрийм лимит** — колко стрийма паралелно (различни инфлуенсъри по едно и също време)?
5. **Геофилтър** — само BG зрители или всички?
6. **Recording по подразбиране ON?** — Mux зарежда $0.003/мин съхранение

---

## Tech checklist преди Phase 2

- [ ] Mux акаунт + production API ключове
- [ ] Решение за payment flow (Shopify checkout vs custom)
- [ ] Тестов канал за OBS streaming
- [ ] CORS / CSP настройки в `next.config.js` за Mux player domain
- [ ] Решение за iOS Safari autoplay (вероятно muted-by-default на mobile)

---

## Цена за стартиране

Не очаквам infrastructure cost > $50/месец при до 100 зрители × 5 стрийма/седмица. Cloudflare Stream Live би било още по-евтино на тази скала, но Mux DX-ът ще ни спести седмица време на implementation.
