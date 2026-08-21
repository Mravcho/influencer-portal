-- =============================================================
-- Поръчки, дошли през UTM линк (за статистиката в /admin/utm-links)
-- Idempotent — безопасно е да се пусне многократно.
-- =============================================================

-- utm_links.clicks брои кликовете, но не и поръчките. Тук пазим по една
-- редица за всяка поръчка от магазина, чийто landing URL носи наш alias
-- (_ref=<alias> или utm_content=<alias>). Включва и поръчки БЕЗ промокод —
-- затова е отделна таблица, а не колона в orders.
CREATE TABLE IF NOT EXISTS utm_orders (
  shopify_order_id  BIGINT PRIMARY KEY,
  alias             TEXT NOT NULL,
  order_number      TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  total_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency          TEXT,
  financial_status  TEXT,
  cancelled_at      TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS utm_orders_alias_idx   ON utm_orders (alias);
CREATE INDEX IF NOT EXISTS utm_orders_created_idx ON utm_orders (created_at DESC);
