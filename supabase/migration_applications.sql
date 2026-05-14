CREATE TABLE IF NOT EXISTS influencer_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  instagram_url   TEXT,
  tiktok_url      TEXT,
  facebook_url    TEXT,
  youtube_url     TEXT,
  other_url       TEXT,
  motivation      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_at     TIMESTAMPTZ,
  reviewer_notes  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_application_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_applications_status  ON influencer_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created ON influencer_applications(created_at DESC);
