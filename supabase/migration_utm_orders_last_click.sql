-- =============================================================
-- UTM поръчки: второ приписване — „последен клик“ (както в Shopify)
-- Idempotent — безопасно е да се пусне многократно.
-- =============================================================

-- Досега utm_orders пазеше само alias — линка, през който клиентът е влязъл
-- в сайта за ПРЪВ път (landing_site на поръчката носи _ref=<alias>).
-- Shopify обаче смята отчетите си по UTM по ПОСЛЕДНИЯ клик преди поръчката
-- (Customer Journey), затова числата се разминаваха. Пазим и двете:
--   alias             — първо влизане (landing_site)
--   last_click_alias  — последен клик (Customer Journey → UTM параметри)
ALTER TABLE utm_orders
  ADD COLUMN IF NOT EXISTS last_click_alias TEXT;

-- Поръчка може да е приписана само по последен клик — тогава alias е празен.
ALTER TABLE utm_orders
  ALTER COLUMN alias DROP NOT NULL;

CREATE INDEX IF NOT EXISTS utm_orders_last_click_idx ON utm_orders (last_click_alias);
