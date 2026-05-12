-- Migration: добавяне на email и email_notifications към influencers
-- Изпълни в: Supabase Dashboard → SQL Editor

alter table influencers
  add column if not exists email text,
  add column if not exists email_notifications boolean not null default true;

-- Коментар
comment on column influencers.email is 'Мейл адресът на инфлуенсъра за нотификации';
comment on column influencers.email_notifications is 'Дали да получава мейл при нова поръчка';
