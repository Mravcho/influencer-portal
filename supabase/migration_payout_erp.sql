-- ERP интеграция за изплащания: пазим ID на разхода в ERP + евент. предупреждение.
-- ДОБАВЯЩА, безопасна за prod.
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS erp_expense_id TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS erp_synced_at  TIMESTAMPTZ;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS erp_warning    TEXT;
