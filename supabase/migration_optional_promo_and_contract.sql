-- Migration:
--   1) Promo код става опционален (за инфлуенсъри без commission setup)
--   2) Нов URL за пренасочване когато няма промокод (share_link_target)
--   3) Договор файл към инфлуенсъра
-- Изпълни в: Supabase Dashboard → SQL Editor

-- 1) Promo код вече не е задължителен
ALTER TABLE influencers
  ALTER COLUMN promo_code DROP NOT NULL;

-- 2) URL за пренасочване когато няма промокод (по подразбиране → SHOP_BASE_URL от env)
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS share_link_target TEXT;

-- 3) Договор (PDF/изображение) — admin прикача
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS contract_url       TEXT,
  ADD COLUMN IF NOT EXISTS contract_filename  TEXT,
  ADD COLUMN IF NOT EXISTS contract_uploaded_at TIMESTAMPTZ;
