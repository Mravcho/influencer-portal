-- ============================================================
-- Influencer Portal – Supabase Schema
-- Изпълни в: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Таблица с инфлуенсъри
create table if not exists influencers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  username    text not null unique,
  password_hash text not null,
  promo_code  text not null unique,
  commission  numeric(5,2) not null default 10.00,  -- процент
  platform    text,                                  -- Instagram, TikTok, etc.
  active      boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Кеш на поръчките от Shopify (без лични данни на клиентите)
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  influencer_id     uuid not null references influencers(id) on delete cascade,
  shopify_order_id  bigint not null unique,
  order_number      text not null,
  created_at_shopify timestamptz not null,
  total_price       numeric(10,2) not null,
  currency          text not null default 'BGN',
  financial_status  text,     -- paid, pending, refunded
  fulfillment_status text,    -- fulfilled, unfulfilled, partial
  line_items        jsonb not null default '[]',  -- [{title, quantity, price}] - БЕЗ клиентски данни
  synced_at         timestamptz not null default now()
);

-- Индекси за производителност
create index if not exists idx_orders_influencer_id on orders(influencer_id);
create index if not exists idx_orders_created_shopify on orders(created_at_shopify desc);
create index if not exists idx_orders_shopify_id on orders(shopify_order_id);
create index if not exists idx_influencers_promo_code on influencers(promo_code);

-- Автоматично обновяване на updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_influencers_updated_at
  before update on influencers
  for each row execute function update_updated_at();

-- Row Level Security – инфлуенсърите виждат САМО собствените си данни
alter table influencers enable row level security;
alter table orders enable row level security;

-- Service role (backend) вижда всичко
create policy "service_role_influencers" on influencers
  for all using (auth.role() = 'service_role');

create policy "service_role_orders" on orders
  for all using (auth.role() = 'service_role');

-- ============================================================
-- DEMO ДАННИ – изтрий преди production
-- Паролата е: "demo123" (bcrypt hash)
-- ============================================================
insert into influencers (name, username, password_hash, promo_code, commission, platform) values
  ('Мария Иванова',      'maria',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'MARIA15', 15, 'Instagram'),
  ('Виктор Попов',       'viktor', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'VIKTOR20', 20, 'TikTok'),
  ('Кристина Михайлова', 'kris',   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'KRIS10',   10, 'YouTube')
on conflict do nothing;
