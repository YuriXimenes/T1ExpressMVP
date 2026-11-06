"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Popover } from "radix-ui";
import { fetchNotifications, markNotifications } from "@/lib/system/api";
import { groupNotifications, type AdminNotification } from "@/lib/system/notifications";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

function relative(iso: string, now: number) {
  const diff = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(diff);
  const text =
    abs < 60
      ? `${abs} min`
      : abs < 48 * 60
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / 1440)} dias`;
  return diff > 0 ? `em ${text}` : `há ${text}`;
}

const DOT = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  info: "bg-slate-400",
} as const;

/** Sino da barra superior: avisos calculados na hora, por permissão (0025). */
export function NotificationsBell() {
  const router = useRouter();
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(() => {
    fetchNotifications()
      .then((r) => {
        setItems(r.items ?? []);
        setUnread(r.unread ?? 0);
        setFailed(false);
        setNow(Date.now());
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    queueMicrotask(load);
    const timer = window.setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function markRead(keys: string[]) {
    if (keys.length === 0) return;
    setItems((prev) =>
      prev ? prev.map((i) => (keys.includes(i.key) ? { ...i, read: true } : i)) : prev,
    );
    setUnread((u) => Math.max(0, u - keys.length));
    try {
      await markNotifications(keys);
    } catch {
      load();
    }
  }

  function openItem(item: AdminNotification) {
    if (!item.read) void markRead([item.key]);
    setOpen(false);
    router.push(item.href);
  }

  const groups = items ? groupNotifications(items) : [];
  const unreadKeys = (items ?? []).filter((i) => !i.read).map((i) => i.key);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <Popover.Trigger
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 data-[state=open]:bg-slate-100"
        aria-label={unread > 0 ? `Notificações: ${unread} não lida(s)` : "Notificações"}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-bold text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 flex max-h-[min(36rem,calc(100vh-5rem))] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">
              Notificações
              {unread > 0 && (
                <span className="ml-1.5 font-normal text-slate-500">
                  {unread} não lida(s)
                </span>
              )}
            </p>
            {unreadKeys.length > 0 && (
              <button
                type="button"
                onClick={() => void markRead(unreadKeys)}
                className="text-brand-600 flex items-center gap-1 text-xs font-medium hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {failed && !items && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Não foi possível carregar os avisos.
              </p>
            )}
            {!failed && !items && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Carregando...
              </p>
            )}
            {items && items.length === 0 && (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-6 w-6 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm text-slate-600">Nada pendente por aqui.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Ocorrências, aprovações, pagamentos e cadastros aparecem aqui.
                </p>
              </div>
            )}
            {groups.map((g) => (
              <section key={g.category}>
                <p className="sticky top-0 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  {g.label}
                </p>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.key}>
                      <button
                        type="button"
                        onClick={() => openItem(i)}
                        className={cn(
                          "flex w-full gap-3 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50",
                          !i.read && "bg-brand-50/40",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            i.read ? "bg-transparent" : DOT[i.severity],
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-sm",
                              i.read ? "text-slate-600" : "font-medium text-slate-900",
                            )}
                          >
                            {i.title}
                          </span>
                          {i.detail && (
                            <span className="block truncate text-xs text-slate-500">
                              {i.detail}
                            </span>
                          )}
                        </span>
                        {now > 0 && (
                          <span className="shrink-0 text-[11px] whitespace-nowrap text-slate-400">
                            {relative(i.at, now)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
