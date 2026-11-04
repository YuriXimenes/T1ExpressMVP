"use client";

import Link from "next/link";
import { ADMIN_NAV, activeNavItem } from "@/components/admin/shell/nav";
import { areaForHref, can, type StaffAccess } from "@/lib/admin/access";
import { cn } from "@/lib/utils";

/** Conteúdo do menu lateral (usado fixo no desktop e na gaveta do celular). */
export function AdminSidebar({
  pathname,
  collapsed,
  access,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  access: StaffAccess;
  onNavigate?: () => void;
}) {
  const activeHref = activeNavItem(pathname)?.item.href;
  // Só as áreas que o perfil pode ver; grupo sem item visível some inteiro.
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const area = areaForHref(item.href);
      return !area || can(access, area, "view");
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-800",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <span className="bg-brand-600 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white">
          T1
        </span>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold text-white">T1 Express</span>
            <span className="block text-[11px] text-slate-400">Backoffice</span>
          </span>
        )}
      </div>

      <nav aria-label="Menu do backoffice" className="flex-1 overflow-y-auto py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-3 px-2">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-slate-800 first:hidden" />
            ) : (
              <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors",
                        collapsed ? "justify-center px-2" : "px-2.5",
                        active
                          ? "bg-white/10 font-medium text-white"
                          : "text-slate-300 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-brand-300" : item.soon && "text-slate-500",
                        )}
                        aria-hidden="true"
                      />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <>
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              item.soon && !active && "text-slate-400",
                            )}
                          >
                            {item.label}
                          </span>
                          {item.soon && (
                            <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                              Em breve
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
