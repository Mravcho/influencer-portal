-- Как е платена заявката за продукт: 'self' (сам) или 'commission' (от изкараната комисионна)
ALTER TABLE product_requests ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'self';
