-- =====================================================================
-- Масови кампании: споделен промокод + per-influencer UTM атрибуция.
-- ДОБАВЯЩА миграция — не променя/трие нищо съществуващо. Безопасна за prod.
-- =====================================================================

-- Кампании
CREATE TABLE IF NOT EXISTS campaigns (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  promo_code             TEXT NOT NULL,                       -- споделеният код (напр. REALFOOD10)
  customer_discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 10,    -- % отстъпка за клиента
  commission_pct         NUMERIC(5,2) NOT NULL DEFAULT 5,     -- % комисионна за инфлуенсъра
  dest_url               TEXT,                                -- дестинация (по подразбиране магазина)
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at              TIMESTAMPTZ,
  ends_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UTM линк -> кампания (колоната influencer_id вече съществува в utm_links)
ALTER TABLE utm_links ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_utm_links_campaign ON utm_links(campaign_id);
-- Един линк на инфлуенсър в дадена кампания
CREATE UNIQUE INDEX IF NOT EXISTS uq_utm_links_campaign_influencer
  ON utm_links(campaign_id, influencer_id)
  WHERE campaign_id IS NOT NULL AND influencer_id IS NOT NULL;

-- Кампанийни поръчки — паралелно на нормалните
ALTER TABLE orders ADD COLUMN IF NOT EXISTS campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2); -- ако е NULL → ползва се ставката на инфлуенсъра
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_alias      TEXT;         -- по кой UTM alias е засечена
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON orders(campaign_id);
