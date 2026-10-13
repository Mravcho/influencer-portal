-- Предишни промокодове на инфлуенсъра (напр. REALNETI5 след преминаване към REALNETI10).
-- Поръчките по тях продължават да се засичат към същия инфлуенсър.
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS old_codes TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_influencers_old_codes ON influencers USING GIN (old_codes);
