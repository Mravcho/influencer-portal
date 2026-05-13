-- Branding (logo + login background)
CREATE TABLE IF NOT EXISTS branding (
  id           SMALLINT PRIMARY KEY DEFAULT 1,
  logo_url     TEXT,
  login_bg_url TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Storage bucket за брандинг (logo + background snimki)
-- ВНИМАНИЕ: Този part трябва да се пусне ръчно в Supabase Storage UI:
--   1. Storage → New bucket
--   2. Name: branding
--   3. Public bucket: ✅ ON
--   4. File size limit: 5 MB
--   5. Allowed MIME types: image/jpeg, image/png, image/webp, image/svg+xml

-- Image URL за всеки line item в поръчките (добавя се само ако още не е там)
-- Това позволява да показваме малки thumbnail-и в дашборда
-- (image_url се пази в jsonb line_items, не като колона — няма нужда от ALTER)
