-- Индивидуална отстъпка за заявки на продукти (празно = отстъпката от каталога)
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS product_discount_pct NUMERIC;
-- Частично плащане от комисионната: колко от paid_total е покрито от баланса
ALTER TABLE product_requests ADD COLUMN IF NOT EXISTS paid_from_commission NUMERIC;
