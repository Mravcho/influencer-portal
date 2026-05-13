CREATE TABLE IF NOT EXISTS login_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id    UUID REFERENCES influencers(id) ON DELETE CASCADE,
  login_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at        TIMESTAMPTZ,
  duration_seconds INT,
  ip_address       TEXT,
  user_agent       TEXT,
  country          TEXT,
  city             TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_influencer ON login_sessions(influencer_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_login_at ON login_sessions(login_at DESC);
