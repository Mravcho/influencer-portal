-- Разширяваме login_sessions да пази и неуспешни опити за вход
ALTER TABLE login_sessions
  ALTER COLUMN influencer_id DROP NOT NULL;

ALTER TABLE login_sessions
  ADD COLUMN IF NOT EXISTS success            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason     TEXT,
  ADD COLUMN IF NOT EXISTS attempted_username TEXT;

CREATE INDEX IF NOT EXISTS idx_login_sessions_success ON login_sessions(success);
