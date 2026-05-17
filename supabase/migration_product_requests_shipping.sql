-- Migration: shipping данни към заявките за продукти + last-used на инфлуенсъра за pre-fill
-- Изпълни в: Supabase Dashboard → SQL Editor

-- Полета на самата заявка (всяка заявка има своя адрес за доставка)
ALTER TABLE product_requests
  ADD COLUMN IF NOT EXISTS shipping_method     TEXT,
  ADD COLUMN IF NOT EXISTS shipping_recipient  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_phone      TEXT,
  ADD COLUMN IF NOT EXISTS shipping_location   TEXT;

-- Стойностите се ограничават до валидните методи (NULL-и са разрешени за стари записи)
ALTER TABLE product_requests
  DROP CONSTRAINT IF EXISTS product_requests_shipping_method_check;
ALTER TABLE product_requests
  ADD CONSTRAINT product_requests_shipping_method_check
  CHECK (shipping_method IS NULL OR shipping_method IN ('econt_office', 'speedy_office', 'boxnow', 'address'));

-- Пазим последно използваните стойности на инфлуенсъра за pre-fill при следваща заявка
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS last_shipping_method     TEXT,
  ADD COLUMN IF NOT EXISTS last_shipping_recipient  TEXT,
  ADD COLUMN IF NOT EXISTS last_shipping_phone      TEXT,
  ADD COLUMN IF NOT EXISTS last_shipping_location   TEXT;
