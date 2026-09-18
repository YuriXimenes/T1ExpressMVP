import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client — uses the secret key, which grants full
 * access and bypasses Row Level Security. Never import this from a "use
 * client" component. Not yet wired into any route/component; the app still
 * runs entirely on mock/localStorage data.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
