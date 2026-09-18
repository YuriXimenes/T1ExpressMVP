import "server-only";
import { cache } from "react";
import { loadCatalogFromSupabase } from "./from-supabase";
import { staticCatalog } from "./static";
import type { Catalog } from "./types";

/**
 * Catálogo de referência para Server Components. Nunca lança: qualquer falha
 * do Supabase (rede, RLS, dado incompleto) cai nos dados estáticos, então o
 * site continua funcionando exatamente como antes.
 */
export const getCatalog = cache(async (): Promise<Catalog> => {
  try {
    return await loadCatalogFromSupabase();
  } catch (error) {
    console.warn(
      "[catalog] Supabase indisponível, usando dados estáticos:",
      error instanceof Error ? error.message : error,
    );
    return staticCatalog;
  }
});
