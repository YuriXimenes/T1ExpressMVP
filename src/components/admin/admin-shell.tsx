"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase/client";
import { fetchMyAccess } from "@/lib/admin/people-api";
import { areaForPath, can, type StaffAccess } from "@/lib/admin/access";
import { AccessProvider } from "@/lib/admin/access-provider";
import { activeNavItem } from "@/components/admin/shell/nav";
import { AdminSidebar } from "@/components/admin/shell/sidebar";
import { NotificationsBell } from "@/components/admin/shell/notifications-bell";
import { AdminUserMenu } from "@/components/admin/shell/user-menu";
import { cn } from "@/lib/utils";

type GuardStatus = "checking" | "allowed" | "denied";

const COLLAPSED_KEY = "t1-admin-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Moldura do backoffice: tela cheia, menu lateral por categoria e barra
 * superior. Antes de mostrar qualquer coisa, carrega o acesso de quem está
 * logado (`my_staff_access`); sem sessão, sem acesso ou inativo, manda para a
 * home sem avisar que /admin existe. O menu e as telas seguem o perfil.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isReady, isLoggedIn } = useAuth();
  const [status, setStatus] = useState<GuardStatus>("checking");
  const [access, setAccess] = useState<StaffAccess | null>(null);
  // Nada da moldura é renderizado no servidor (a guarda começa em "checking"),
  // então ler o localStorage já no estado inicial não causa diferença de hidratação.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

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
        const mine = await fetchMyAccess().catch(() => null);
        if (cancelled) return;
        setAccess(mine);
        setStatus(mine?.status === "ativo" ? "allowed" : "denied");
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [isReady, isLoggedIn]);

  useEffect(() => {
    if (status === "denied") router.replace("/");
  }, [status, router]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? "0" : "1");
      } catch {
        // Sem localStorage (aba anônima etc.): só não lembra a preferência.
      }
      return !prev;
    });
  }

  if (status !== "allowed" || !access) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Carregando...</p>
      </div>
    );
  }

  const active = activeNavItem(pathname);
  const isDetail = !!active && pathname !== active.item.href;
  const area = areaForPath(pathname);
  const blocked = !!area && !can(access, area, "view");

  return (
    <div className="flex h-dvh overflow-clip bg-slate-50 print:block print:h-auto print:overflow-visible print:bg-white">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-slate-800 bg-slate-900 transition-[width] duration-200 lg:block print:hidden",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <AdminSidebar pathname={pathname} collapsed={collapsed} access={access} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 border-slate-800 bg-slate-900 p-0 text-slate-300 sm:max-w-72"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">Menu do backoffice</SheetTitle>
          <AdminSidebar
            pathname={pathname}
            collapsed={false}
            access={access}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4 print:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:block"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <nav aria-label="Você está em" className="min-w-0 flex-1">
            {active && (
              <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                <li className="hidden shrink-0 text-slate-400 sm:block">
                  {active.group.label}
                </li>
                <li className="hidden text-slate-300 sm:block" aria-hidden="true">
                  ›
                </li>
                <li
                  className={cn(
                    "truncate",
                    isDetail ? "text-slate-400" : "font-medium text-slate-900",
                  )}
                >
                  {active.item.label}
                </li>
                {isDetail && (
                  <>
                    <li className="text-slate-300" aria-hidden="true">
                      ›
                    </li>
                    <li className="truncate font-medium text-slate-900">Detalhe</li>
                  </>
                )}
              </ol>
            )}
          </nav>

          <NotificationsBell />
          <AdminUserMenu />
        </header>

        <main
          id="main-content"
          className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto print:overflow-visible"
        >
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8 print:m-0 print:max-w-none print:p-0">
            <AccessProvider access={access}>
              {blocked ? (
                <div className="mx-auto max-w-md py-16 text-center">
                  <p className="text-lg font-semibold text-slate-900">
                    Sem acesso a esta área
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Seu perfil ({access.roleName}) não tem permissão para ver esta tela.
                    Fale com um Administrador se precisar.
                  </p>
                </div>
              ) : (
                children
              )}
            </AccessProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
