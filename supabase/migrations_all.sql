-- =============================================================
-- RealFood Influencer Portal — пълна schema migration
-- Idempotent: безопасно е да се пусне многократно.
-- Пусни този файл винаги когато ъпдейтнеш кода.
-- =============================================================

-- ===== INFLUENCERS — допълнителни колони =====
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS profile_url          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url           TEXT,
  ADD COLUMN IF NOT EXISTS banner_url           TEXT,
  ADD COLUMN IF NOT EXISTS email                TEXT,
  ADD COLUMN IF NOT EXISTS email_notifications  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes                TEXT;

-- ===== ORDERS — допълнителни колони =====
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commissionable_revenue NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_savings          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS shipping_total         NUMERIC(10,2) DEFAULT 0;

-- ===== BRANDING (логo + login background) =====
CREATE TABLE IF NOT EXISTS branding (
  id           SMALLINT PRIMARY KEY DEFAULT 1,
  logo_url     TEXT,
  login_bg_url TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ===== LOGIN SESSIONS — успешни + неуспешни опити =====
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

-- ако таблицата е създадена с NOT NULL по-старо, разхлабваме
ALTER TABLE login_sessions ALTER COLUMN influencer_id DROP NOT NULL;

ALTER TABLE login_sessions
  ADD COLUMN IF NOT EXISTS success            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason     TEXT,
  ADD COLUMN IF NOT EXISTS attempted_username TEXT;

CREATE INDEX IF NOT EXISTS idx_login_sessions_influencer ON login_sessions(influencer_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_login_at   ON login_sessions(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_sessions_success    ON login_sessions(success);

-- ===== PASSWORD RESET TOKENS =====
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_influencer ON password_reset_tokens(influencer_id);

-- ===== PAYOUT REQUESTS =====
CREATE TABLE IF NOT EXISTS payout_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id  UUID REFERENCES influencers(id) ON DELETE CASCADE NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ,
  notes          TEXT,
  admin_notes    TEXT,
  CONSTRAINT positive_amount CHECK (amount > 0),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'paid', 'rejected'))
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_influencer ON payout_requests(influencer_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status     ON payout_requests(status);
