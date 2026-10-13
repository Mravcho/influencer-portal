-- 10% код на инфлуенсъра (включва се за определен период от Админ → Инфлуенсъри).
-- Основният код (promo_code, 5%) е винаги активен.
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS boost_code TEXT;
CREATE INDEX IF NOT EXISTS idx_influencers_boost_code ON influencers(boost_code);
-- Дали в момента е включен 10% кодът (за всички инфлуенсъри)
ALTER TABLE branding ADD COLUMN IF NOT EXISTS boost_active BOOLEAN NOT NULL DEFAULT false;

-- Вече създадените ИМЕ10 кодове (бяха станали основни): основен пак е 5%-ният,
-- а ИМЕ10 става 10% кодът
UPDATE influencers
SET boost_code = promo_code,
    promo_code = old_codes[array_length(old_codes, 1)],
    old_codes  = old_codes[1:array_length(old_codes, 1) - 1]
WHERE boost_code IS NULL
  AND promo_code ~ '10$'
  AND array_length(old_codes, 1) > 0
  AND old_codes[array_length(old_codes, 1)] = regexp_replace(promo_code, '10$', '') || '5';
