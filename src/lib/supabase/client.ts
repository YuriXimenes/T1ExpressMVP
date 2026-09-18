import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Client Supabase para o navegador — usa a chave publicável (não é segredo) e
 * mantém a sessão do usuário persistida. Singleton para não criar várias
 * instâncias de Auth.
 */
export function createBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return browserClient;
}
