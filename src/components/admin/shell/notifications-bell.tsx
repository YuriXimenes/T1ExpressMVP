"use client";

import { Bell } from "lucide-react";
import { Popover } from "radix-ui";

/**
 * Sino da barra superior. A central de notificações chega numa entrega
 * futura; por enquanto o painel só avisa que não há nada.
 */
export function NotificationsBell() {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 data-[state=open]:bg-slate-100"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            Notificações
          </p>
          <div className="px-4 py-8 text-center">
            <Bell className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-600">Nenhuma notificação ainda.</p>
            <p className="mt-1 text-xs text-slate-400">
              Alertas de pedidos, ocorrências e aprovações vão aparecer aqui.
            </p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
