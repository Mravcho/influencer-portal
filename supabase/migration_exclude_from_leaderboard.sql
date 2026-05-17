-- Migration: отделна отметка „Изключи от класацията" (независима от active)
-- Изпълни в: Supabase Dashboard → SQL Editor

ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS exclude_from_leaderboard BOOLEAN NOT NULL DEFAULT FALSE;
