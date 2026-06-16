-- =============================================================
-- Общи условия (Terms & Conditions)
-- Idempotent — безопасно е да се пусне многократно.
-- =============================================================

-- Файлът с общите условия се пази в branding (single-row таблица).
-- terms_updated_at се обновява при всяко ново качване — това инвалидира
-- старите приемания и кара всеки инфлуенсър да приеме наново.
ALTER TABLE branding
  ADD COLUMN IF NOT EXISTS terms_url        TEXT,
  ADD COLUMN IF NOT EXISTS terms_updated_at TIMESTAMPTZ;

-- Кога даден инфлуенсър последно е приел общите условия.
-- Изисква приемане, ако е NULL или е по-старо от branding.terms_updated_at.
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Съгласие с общите условия във формата за кандидатстване.
ALTER TABLE influencer_applications
  ADD COLUMN IF NOT EXISTS terms_accepted    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
