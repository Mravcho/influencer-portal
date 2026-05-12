-- Изпълни в: Supabase Dashboard → SQL Editor

-- Нови полета за инфлуенсъри
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS profile_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT;

-- Нови полета за поръчки (комисионна и спестено)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commissionable_revenue NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_savings          NUMERIC(10,2);
