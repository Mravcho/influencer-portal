-- Имейли за админ известия, управлявани от Админ → Настройки
ALTER TABLE branding ADD COLUMN IF NOT EXISTS notify_emails JSONB;
