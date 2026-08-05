-- Чат между инфлуенсър и админ. Всеки инфлуенсър има една нишка към админа.
CREATE TABLE IF NOT EXISTS chat_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id      UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  sender             TEXT NOT NULL CHECK (sender IN ('influencer', 'admin')),
  body               TEXT NOT NULL,
  read_by_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_influencer BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_influencer ON chat_messages(influencer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread_admin ON chat_messages(read_by_admin) WHERE sender = 'influencer' AND read_by_admin = FALSE;
