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
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);
