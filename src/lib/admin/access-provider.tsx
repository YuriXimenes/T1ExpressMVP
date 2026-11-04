"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  can,
  type StaffAccess,
  type StaffAction,
  type StaffArea,
} from "@/lib/admin/access";

const AccessContext = createContext<StaffAccess | null>(null);

/** Acesso de quem está logado, carregado uma vez pelo AdminShell. */
export function AccessProvider({
  access,
  children,
}: {
  access: StaffAccess;
  children: ReactNode;
}) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): StaffAccess | null {
  return useContext(AccessContext);
}

/** O perfil permite? O banco confere de novo; aqui é só para mostrar/esconder botões. */
export function useCan(area: StaffArea, action: StaffAction = "view"): boolean {
  return can(useContext(AccessContext), area, action);
}
