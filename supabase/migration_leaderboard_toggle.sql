-- Класацията за инфлуенсърите може да се изключи от Админ → Настройки
-- (в админ панела класацията остава винаги)
ALTER TABLE branding ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN NOT NULL DEFAULT true;
