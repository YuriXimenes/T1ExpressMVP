"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

/**
 * Quem já está logado não precisa ver telas de entrada (login, criar conta).
 * Vai para o mesmo destino que o formulário usaria depois do cadastro/login,
 * então as duas navegações nunca se contradizem.
 */
export function LoggedInRedirect({ next }: { next?: string }) {
  const router = useRouter();
  const { isLoggedIn, isReady } = useAuth();

  useEffect(() => {
    if (isReady && isLoggedIn) router.replace(safeNext(next));
  }, [isReady, isLoggedIn, next, router]);

  return null;
}
