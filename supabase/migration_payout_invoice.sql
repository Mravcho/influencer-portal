-- Migration: задължителна фактура при заявка за изплащане
-- Изпълни в: Supabase Dashboard → SQL Editor

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS invoice_url       TEXT,
  ADD COLUMN IF NOT EXISTS invoice_filename  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_uploaded_at TIMESTAMPTZ;

-- За старите заявки колоните остават NULL.
-- За новите заявки backend-ът налага invoice_url да е задължителен.
