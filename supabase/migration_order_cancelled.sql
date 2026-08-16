-- =============================================================
-- Анулирани поръчки (cancelled_at)
-- Idempotent — безопасно е да се пусне многократно.
-- =============================================================

-- Shopify пази анулирането отделно от financial_status: поръчка, анулирана
-- след като е платена и без издаден рефанд, остава financial_status = 'paid'.
-- Затова пазим и точния момент на анулиране — той е меродавен.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_cancelled_at_idx ON orders (cancelled_at);
