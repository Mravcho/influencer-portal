-- Migration: добавяме customer info колони към orders за admin feed
-- Изпълни в: Supabase Dashboard → SQL Editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name   TEXT,
  ADD COLUMN IF NOT EXISTS customer_email  TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city   TEXT;

-- Бъдещите webhook + sync upserts ще пълнят тези полета.
-- За стари поръчки колоните остават NULL — мога да направя backfill ако се наложи.
