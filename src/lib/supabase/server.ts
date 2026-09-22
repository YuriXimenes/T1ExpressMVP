import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Server-only Supabase client — uses the secret key, which grants full
 * access and bypasses Row Level Security. Never import this from a "use
 * client" component. Not yet wired into any route/component — a futura tela
 * de admin (Etapa 5) é quem vai usar.
 *
 * Tipado com `Database` (ver client.ts).
 */
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
