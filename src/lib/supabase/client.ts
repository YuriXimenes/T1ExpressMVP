import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Client Supabase para o navegador — usa a chave publicável (não é segredo) e
 * mantém a sessão do usuário persistida. Singleton para não criar várias
 * instâncias de Auth.
 *
 * Tipado com `Database` (gerado a partir do schema real — ver
 * `database.types.ts` e o script `npm run db:types`), então `.from(...)`
 * ganha autocomplete e erro de tipo se uma tabela/coluna mudar. Isso não
 * troca as interfaces de linha já escritas à mão em `orders/api.ts`, só o
 * client fica mais seguro para código novo.
 */
export function createBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return browserClient;
}
