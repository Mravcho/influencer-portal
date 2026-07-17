-- =============================================================
-- UTM Links — admin marketing links + daily click aggregates.
-- Migrated from the standalone utm-link-manager Shopify app.
-- Model is intentionally aggregate (per-day counts), because the source
-- data only has daily totals — not individual click events.
-- =============================================================

CREATE TABLE IF NOT EXISTS utm_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias         TEXT UNIQUE NOT NULL,           -- short key: portal.realfood.bg/go/<alias>
  label         TEXT,
  dest_url      TEXT NOT NULL,                   -- destination without UTM params
  full_url      TEXT NOT NULL,                   -- destination WITH utm_* + _ref (redirect target)
  utm_source    TEXT NOT NULL,
  utm_medium    TEXT NOT NULL,
  utm_campaign  TEXT NOT NULL,
  utm_term      TEXT,
  utm_content   TEXT,
  utm_id        TEXT,
  clicks        INTEGER NOT NULL DEFAULT 0,      -- denormalized lifetime total
  last_click_at TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT true,
  influencer_id UUID REFERENCES influencers(id) ON DELETE SET NULL, -- NULL = admin/marketing link
  legacy_shop   TEXT,                            -- original myshopify domain (reference only)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_utm_links_created    ON utm_links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_links_influencer ON utm_links(influencer_id);

CREATE TABLE IF NOT EXISTS utm_daily_clicks (
  id     BIGSERIAL PRIMARY KEY,
  alias  TEXT NOT NULL REFERENCES utm_links(alias) ON DELETE CASCADE,
  date   TEXT NOT NULL,                          -- YYYY-MM-DD (UTC)
  count  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (alias, date)
);
CREATE INDEX IF NOT EXISTS idx_utm_daily_alias ON utm_daily_clicks(alias);

-- Atomic click recorder: bump lifetime total + today's daily bucket in one call.
-- Called from the /go/<alias> redirect via supabaseAdmin.rpc('record_utm_click', ...).
CREATE OR REPLACE FUNCTION record_utm_click(p_alias TEXT)
RETURNS void AS $$
BEGIN
  UPDATE utm_links
     SET clicks = clicks + 1, last_click_at = now()
   WHERE alias = p_alias;
  IF FOUND THEN
    INSERT INTO utm_daily_clicks (alias, date, count)
    VALUES (p_alias, to_char(timezone('utc', now()), 'YYYY-MM-DD'), 1)
    ON CONFLICT (alias, date) DO UPDATE SET count = utm_daily_clicks.count + 1;
  END IF;
END;
$$ LANGUAGE plpgsql;
