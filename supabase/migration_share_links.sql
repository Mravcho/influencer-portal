-- =============================================================
-- Share links + click tracking
-- =============================================================

CREATE TABLE IF NOT EXISTS share_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id  UUID REFERENCES influencers(id) ON DELETE CASCADE NOT NULL,
  short_code     TEXT UNIQUE NOT NULL,
  target_url     TEXT NOT NULL,
  label          TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_links_influencer ON share_links(influencer_id);
CREATE INDEX IF NOT EXISTS idx_share_links_code       ON share_links(short_code);

CREATE TABLE IF NOT EXISTS link_clicks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id        UUID REFERENCES share_links(id) ON DELETE CASCADE,
  influencer_id  UUID REFERENCES influencers(id) ON DELETE CASCADE NOT NULL,
  clicked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address     TEXT,
  user_agent     TEXT,
  country        TEXT,
  city           TEXT,
  referrer       TEXT
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link       ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_influencer ON link_clicks(influencer_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks(clicked_at DESC);
