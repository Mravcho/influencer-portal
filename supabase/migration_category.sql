-- Категории (инфлуенсъри/партньори/козметици) + toggle за заявка на продукти.
-- ДОБАВЯЩА, безопасна за prod. Всички съществуващи стават 'influencers' и с право да заявяват.
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'influencers';
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS can_request_products BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_influencers_category ON influencers(category);
