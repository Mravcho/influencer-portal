import { createClient } from '@supabase/supabase-js'

// Client за frontend (анонимен – само четене на публични данни)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Client за backend API routes (пълен достъп).
// ВАЖНО: подаваме собствен fetch с cache: 'no-store', защото Next.js patch-ва
// глобалния fetch и кешира supabase заявките в Data Cache (survive-ва деплойи).
// Това водеше до „замразени" резултати (напр. нови поръчки да не се виждат в
// списъка). С no-store всяка заявка е свежа.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options, cache: 'no-store' }) },
  }
)
