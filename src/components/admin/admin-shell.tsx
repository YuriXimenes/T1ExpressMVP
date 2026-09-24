"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Package, Mail, Store, ShieldCheck, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase/client";
import { checkIsAdmin } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/pedidos", label: "Pedidos", icon: Package },
  { href: "/admin/formularios", label: "Formulários", icon: Mail },
  { href: "/admin/catalogo", label: "Catálogo", icon: Store },
  { href: "/admin/administradores", label: "Administradores", icon: ShieldCheck },
];

type GuardStatus = "checking" | "allowed" | "denied";

/**
 * Guarda de acesso do painel: confere se o usuário logado está na tabela
 * `admins` (via RLS, sem RPC nenhuma). Sem sessão ou sem ser admin, manda
 * para a home sem avisar que /admin existe.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isReady, isLoggedIn } = useAuth();
  const [status, setStatus] = useState<GuardStatus>("checking");

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do
    // efeito (mesmo o caminho "não está logado"), evitando cascata de render.
    queueMicrotask(() => {
      void (async () => {
        if (!isLoggedIn) {
          if (!cancelled) setStatus("denied");
          return;
        }
        const { data } = await createBrowserClient().auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) {
          if (!cancelled) setStatus("denied");
          return;
        }
        const ok = await checkIsAdmin(userId);
        if (!cancelled) setStatus(ok ? "allowed" : "denied");
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [isReady, isLoggedIn]);

  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  if (status !== "allowed") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Carregando...</p>
      </div>
    );
  }

  return (
    // min-w-0 em cada nível + nada de largura mínima fixa: em telas estreitas o
    // menu empilha em cima (linha horizontal com rolagem própria) em vez de
    // forçar a página inteira (cabeçalho do site incluso) a ficar mais larga
    // que a tela — era isso que fazia o layout "pular" de tamanho entre telas.
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col md:min-h-screen md:flex-row">
      <aside className="flex w-full min-w-0 shrink-0 flex-col gap-1 border-b border-slate-200 px-3 py-3 md:w-56 md:border-r md:border-b-0 md:py-6">
        <p className="px-3 pb-2 text-sm font-semibold text-slate-900 md:pb-4">
          T1 Express · Admin
        </p>
        <div className="-mx-3 flex min-w-0 gap-1 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="hidden pt-6 md:mt-auto md:block md:px-3">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
            Voltar ao site
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
