-- Архивиране на кампании (меко триене) — пази поръчките и комисионните.
-- ДОБАВЯЩА, безопасна за prod.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
