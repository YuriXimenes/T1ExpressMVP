"use client";

import { createContext, useContext } from "react";
import { staticCatalog } from "./static";
import type { Catalog } from "./types";

const CatalogContext = createContext<Catalog | null>(null);

export function CatalogProvider({
  catalog,
  children,
}: {
  catalog: Catalog;
  children: React.ReactNode;
}) {
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

/** Sem provider (não deveria acontecer), cai nos dados estáticos em vez de quebrar. */
export function useCatalog(): Catalog {
  return useContext(CatalogContext) ?? staticCatalog;
}
