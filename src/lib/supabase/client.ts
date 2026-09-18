import { createClient } from "@supabase/supabase-js";

/**
 * Client-side Supabase client, safe to use in the browser — uses the
 * publishable key, which is not a secret. Not yet wired into any component;
 * the app still runs entirely on mock/localStorage data.
 */
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
