-- Migration: каталог с продукти за заявка от инфлуенсъри + история на заявките
-- Изпълни в: Supabase Dashboard → SQL Editor

-- Каталог продукти. is_global=true → видим за всички; false → само за изрично assigned-нати чрез join таблицата.
CREATE TABLE IF NOT EXISTS request_products (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_product_id     TEXT NOT NULL,
  shopify_variant_id     TEXT,
  name                   TEXT NOT NULL,
  image_url              TEXT,
  price                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  request_interval_days  INT  NOT NULL DEFAULT 30 CHECK (request_interval_days >= 0),
  free_quantity          INT  NOT NULL DEFAULT 1 CHECK (free_quantity >= 0),
  paid_discount_pct      NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (paid_discount_pct >= 0 AND paid_discount_pct <= 100),
  is_global              BOOLEAN NOT NULL DEFAULT TRUE,
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индивидуални достъпи: само за продукти с is_global = false.
CREATE TABLE IF NOT EXISTS influencer_request_products (
  influencer_id       UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  request_product_id  UUID NOT NULL REFERENCES request_products(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (influencer_id, request_product_id)
);

-- История на заявките
CREATE TABLE IF NOT EXISTS product_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id            UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  request_product_id       UUID NOT NULL REFERENCES request_products(id) ON DELETE CASCADE,
  quantity                 INT  NOT NULL CHECK (quantity > 0),
  free_quantity            INT  NOT NULL DEFAULT 0,
  paid_quantity            INT  NOT NULL DEFAULT 0,
  paid_total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  shopify_draft_order_id   TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent_to_shopify', 'fulfilled', 'cancelled')),
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at             TIMESTAMPTZ,
  notes                    TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_requests_influencer_product
  ON product_requests(influencer_id, request_product_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_requests_status
  ON product_requests(status, requested_at DESC);
