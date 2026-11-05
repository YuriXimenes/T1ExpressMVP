"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/components/shared/price";
import { useAuth } from "@/lib/auth";
import { orderCode } from "@/lib/admin/order-moves";
import {
  PartnerError,
  fetchMyStores,
  fetchStoreCollections,
  fetchStoreDashboard,
  fetchStoreFinance,
  fetchStorePickups,
  fetchStoreTeam,
  inviteStoreMember,
  setTeamMemberActive,
  storeInviteLink,
  type MyStore,
  type StoreCollection,
  type StoreDashboard,
  type StoreFinance,
  type StoreInvite,
  type StoreMember,
  type StorePickups,
} from "@/lib/partners/api";
import { fetchStoreOccurrences, type Occurrence } from "@/lib/occurrences/api";
import { occurrenceCode } from "@/lib/occurrences/rules";
import { GUARD_STATE_LABELS, daysWaiting, guardState } from "@/lib/points/guard";
import { DELIVERY_STAGES } from "@/lib/order-helpers";
import { cn } from "@/lib/utils";
import { FinancePanel } from "@/components/store/finance-panel";
import {
  CopyLink,
  shortDate,
  shortDateTime,
} from "@/components/admin/parceiros/partner-ui";
import {
  OccurrenceStatusBadge,
  OccurrenceThread,
} from "@/components/occurrences/occurrence-thread";

type Tab = "inicio" | "coletas" | "ponto" | "ocorrencias" | "financeiro" | "equipe";
const STORAGE_KEY = "t1.store.current";

const errorText = (err: unknown, fallback: string) =>
  err instanceof PartnerError ? err.message : fallback;

const dayMonth = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

/** Área da loja parceira: coletas, ponto de retirada, ocorrências, financeiro e equipe. */
export function StoreApp() {
  const router = useRouter();
  const { isReady, isLoggedIn, user, logout } = useAuth();
  const [stores, setStores] = useState<MyStore[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inicio");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (!isLoggedIn) {
      router.replace("/login?next=%2Floja");
      return;
    }
    queueMicrotask(() => {
      fetchMyStores()
        .then((list) => {
          setStores(list);
          let saved: string | null = null;
          try {
            saved = localStorage.getItem(STORAGE_KEY);
          } catch {
            saved = null;
          }
          setCode(list.find((s) => s.code === saved)?.code ?? list[0]?.code ?? null);
        })
        .catch((err) => setError(errorText(err, "Não foi possível carregar.")));
    });
  }, [isReady, isLoggedIn, router]);

  function choose(next: string) {
    setCode(next);
    setTab("inicio");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem armazenamento local: só não lembra a loja escolhida.
    }
  }

  async function signOut() {
    await logout();
    router.replace("/login?next=%2Floja");
  }

  const store = stores?.find((s) => s.code === code);
  const tabs: [Tab, string][] = [
    ["inicio", "Início"],
    ["coletas", "Coletas"],
    ...(store?.isPickupPoint
      ? ([["ponto", "Ponto de retirada"]] as [Tab, string][])
      : []),
    ["ocorrencias", "Ocorrências"],
    ...(store?.isPickupPoint ? ([["financeiro", "Financeiro"]] as [Tab, string][]) : []),
    ...(store?.role === "responsavel" ? ([["equipe", "Equipe"]] as [Tab, string][]) : []),
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col bg-slate-50">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="bg-brand-600 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white">
              T1
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">
                {store?.name ?? "Área da loja"}
              </p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stores && stores.length > 1 && (
              <select
                aria-label="Loja"
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
                value={code ?? ""}
                onChange={(e) => choose(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {isLoggedIn && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void signOut()}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sair
              </Button>
            )}
          </div>
        </div>
        {store && (
          <nav className="-mx-1 flex gap-1 overflow-x-auto" aria-label="Seções da loja">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-sm font-medium",
                  tab === id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main id="main-content" className="flex flex-1 flex-col gap-4 p-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {!stores && !error && <p className="text-sm text-slate-500">Carregando...</p>}
        {stores && stores.length === 0 && (
          <Card className="p-6 text-center">
            <p className="font-semibold text-slate-900">Sem acesso a nenhuma loja</p>
            <p className="mt-2 text-sm text-slate-600">
              Esta conta ({user?.email}) não está ligada a uma loja parceira. Peça um
              convite para o responsável da loja ou para a T1 Express.
            </p>
          </Card>
        )}
        {store && !store.published && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Sua loja foi aprovada e está sendo configurada pela T1. Ela aparece no site
            para os clientes assim que a configuração terminar.
          </p>
        )}
        {store && tab === "inicio" && (
          <Home code={store.code} isPickup={store.isPickupPoint} onGo={setTab} />
        )}
        {store && tab === "coletas" && <Collections code={store.code} />}
        {store && tab === "ponto" && <Pickups code={store.code} />}
        {store && tab === "ocorrencias" && <Occurrences code={store.code} />}
        {store && tab === "financeiro" && <Finance code={store.code} />}
        {store && tab === "equipe" && <Team code={store.code} />}
      </main>
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function reload() {
    try {
      setData(await fn());
      setError(null);
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar."));
    }
  }
  useEffect(() => {
    queueMicrotask(() => void reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload };
}

function Loading({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-600">
      {error}
    </p>
  ) : (
    <p className="text-sm text-slate-500">Carregando...</p>
  );
}

function Home({
  code,
  isPickup,
  onGo,
}: {
  code: string;
  isPickup: boolean;
  onGo: (t: Tab) => void;
}) {
  const { data, error } = useLoad<StoreDashboard>(
    () => fetchStoreDashboard(code),
    [code],
  );
  if (!data) return <Loading error={error} />;
  const tile = (
    label: string,
    value: number | string,
    tab: Tab,
    tone?: "amber" | "red",
  ) => (
    <button
      type="button"
      onClick={() => onGo(tab)}
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300"
    >
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold",
          tone === "red"
            ? "text-red-600"
            : tone === "amber"
              ? "text-amber-600"
              : "text-slate-900",
        )}
      >
        {value}
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      {isPickup && (
        <div
          className={cn(
            "rounded-xl border p-4",
            data.next.late
              ? "border-red-200 bg-red-50"
              : "border-emerald-200 bg-emerald-50",
          )}
        >
          <p className="text-xs font-medium text-slate-600">Próximo recebimento</p>
          <p className="text-xl font-semibold text-slate-900">
            {dayMonth(data.next.date)} · {formatBRL(data.next.amount)}
            {data.next.estimated && (
              <span className="text-sm font-normal text-slate-500"> (estimado)</span>
            )}
          </p>
          <p className="text-xs text-slate-600">
            No mês até agora: {formatBRL(data.monthTotal)}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile("Pedidos para separar", data.toCollect, "coletas")}
        {isPickup && tile("Pacotes guardados", data.stored, "ponto")}
        {isPickup &&
          tile(
            "Prazo de guarda vencido",
            data.guardExpired,
            "ponto",
            data.guardExpired ? "red" : undefined,
          )}
        {isPickup && tile("Retiradas no mês", data.pickupsMonth, "ponto")}
        {tile(
          "Ocorrências abertas",
          data.openOccurrences,
          "ocorrencias",
          data.openOccurrences ? "amber" : undefined,
        )}
      </div>
    </div>
  );
}

function Collections({ code }: { code: string }) {
  const { data, error } = useLoad<StoreCollection[]>(
    () => fetchStoreCollections(code),
    [code],
  );
  if (!data) return <Loading error={error} />;
  const stageLabel = (s: string) => DELIVERY_STAGES.find((x) => x.id === s)?.label ?? s;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Pedidos para a T1 buscar</h1>
        <p className="text-sm text-slate-500">
          Separe os itens de cada pedido e deixe identificados com o código. O entregador
          confere na coleta.
        </p>
      </div>
      {data.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum pedido para separar agora.</p>
      )}
      {data.map((o) => (
        <Card key={o.orderId} className="gap-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">
              #{orderCode(o.orderId)}
              {o.customerFirstName && (
                <span className="font-normal text-slate-500">
                  {" "}
                  · {o.customerFirstName}
                </span>
              )}
            </p>
            <span className="text-xs text-slate-500">
              {o.routeDay
                ? `Coleta prevista ${shortDate(o.routeDay)}`
                : "Coleta a agendar"}{" "}
              · {stageLabel(o.stage)}
            </span>
          </div>
          <ul className="text-sm text-slate-700">
            {o.cards.map((c, i) => (
              <li key={`c${i}`}>
                {c.quantity}× {c.name}{" "}
                <span className="text-xs text-slate-400">
                  ({c.game === "outro" ? c.otherGame : c.game})
                </span>
              </li>
            ))}
            {o.accessories.map((a, i) => (
              <li key={`a${i}`}>
                {a.quantity}× {a.kind === "outro" ? a.other : a.kind}
              </li>
            ))}
            {o.cards.length + o.accessories.length === 0 && (
              <li className="text-xs text-slate-400">Itens não detalhados no pedido.</li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Pickups({ code }: { code: string }) {
  const { data, error } = useLoad<StorePickups>(() => fetchStorePickups(code), [code]);
  if (!data) return <Loading error={error} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="bg-brand-50 text-brand-900 flex items-start gap-2 rounded-lg p-3 text-sm">
        <QrCode className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Na retirada, aponte a câmera do celular para o QR do pacote (logado com esta
        conta) e digite o código de 6 dígitos que o cliente informar.
      </p>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Guardados ({data.stored.length})
        </h2>
        {data.stored.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum pacote guardado.</p>
        )}
        {data.stored.map((p) => {
          const state = guardState(p.guardUntil);
          return (
            <div
              key={p.orderId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-slate-900">
                  #{orderCode(p.orderId)}
                </span>
                {p.customerFirstName && (
                  <span className="text-slate-500"> · {p.customerFirstName}</span>
                )}
              </span>
              <span className="text-xs text-slate-500">
                {daysWaiting(p.availableAt)} dia(s) · retirar até{" "}
                {shortDateTime(p.guardUntil)}{" "}
                <span
                  className={cn(
                    "ml-1 rounded-full px-2 py-0.5 font-medium",
                    state === "expired"
                      ? "bg-red-50 text-red-700"
                      : state === "today"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {GUARD_STATE_LABELS[state]}
                </span>
              </span>
            </div>
          );
        })}
      </section>
      {data.incoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            A caminho ({data.incoming.length})
          </h2>
          <p className="text-sm text-slate-600">
            {data.incoming.map((p) => `#${orderCode(p.orderId)}`).join(", ")}
          </p>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Retiradas (60 dias)
        </h2>
        {data.pickedUp.length === 0 && (
          <p className="text-sm text-slate-500">Nenhuma retirada ainda.</p>
        )}
        {data.pickedUp.map((p) => (
          <div
            key={p.orderId}
            className="flex flex-wrap justify-between gap-2 text-sm text-slate-600"
          >
            <span>
              #{orderCode(p.orderId)}
              {p.customerFirstName && ` · ${p.customerFirstName}`}
            </span>
            <span className="text-xs text-slate-500">{shortDateTime(p.pickedUpAt)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function Occurrences({ code }: { code: string }) {
  const { data, error, reload } = useLoad<Occurrence[]>(
    () => fetchStoreOccurrences(code),
    [code],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-slate-900">Ocorrências da loja</h1>
      {data.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma ocorrência ligada à loja.</p>
      )}
      {data.map((o) => {
        const expanded = openId === o.id;
        return (
          <Card key={o.id} className="gap-2 p-4">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpenId(expanded ? null : o.id)}
              className="flex flex-wrap items-center gap-2 text-left"
            >
              <span className="font-semibold text-slate-900">
                {occurrenceCode(o.number)}
              </span>
              <span className="text-sm text-slate-700">{o.typeName}</span>
              <OccurrenceStatusBadge occurrence={o} />
              <span className="text-xs text-slate-500">{shortDateTime(o.createdAt)}</span>
            </button>
            {expanded && (
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-3">
                <p className="text-sm whitespace-pre-wrap text-slate-700">
                  {o.description}
                </p>
                <OccurrenceThread occurrence={o} viewer="store" onChanged={reload} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Finance({ code }: { code: string }) {
  const { data, error } = useLoad<StoreFinance>(() => fetchStoreFinance(code), [code]);
  if (!data) return <Loading error={error} />;
  return (
    <Card className="gap-3 p-5">
      <h1 className="text-lg font-semibold text-slate-900">Financeiro</h1>
      <FinancePanel finance={data} />
    </Card>
  );
}

function Team({ code }: { code: string }) {
  const { data, error, reload } = useLoad<{
    members: StoreMember[];
    invites: StoreInvite[];
  }>(() => fetchStoreTeam(code), [code]);
  const [invite, setInvite] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(errorText(err, "Não foi possível concluir."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-5">
      <h1 className="text-lg font-semibold text-slate-900">Equipe da loja</h1>
      <p className="text-sm text-slate-500">
        Quem pode usar a área da loja (por exemplo, quem fica no balcão lendo o QR).
      </p>
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      <ul className="flex flex-col gap-1.5">
        {data.members.map((m) => (
          <li
            key={m.userId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium text-slate-900">{m.name}</span>{" "}
              <span className="text-slate-500">
                · {m.role === "responsavel" ? "Responsável" : "Funcionário"}
              </span>
              {!m.active && <span className="text-slate-400"> · inativo</span>}
            </span>
            {m.role === "funcionario" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => setTeamMemberActive(code, m.userId, !m.active))
                }
              >
                {m.active ? "Desativar" : "Reativar"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        className="self-start"
        size="sm"
        disabled={busy}
        onClick={() => void run(async () => setInvite(await inviteStoreMember(code)))}
      >
        Convidar funcionário
      </Button>
      {invite && (
        <>
          <CopyLink value={storeInviteLink(invite)} label="Link do convite" />
          <p className="text-xs text-slate-500">
            Vale 7 dias e uma pessoa só. Envie pelo WhatsApp.
          </p>
        </>
      )}
      <p className="text-xs text-slate-400">
        Precisa mudar dados da loja ou da conta de recebimento? Fale com a T1 Express.{" "}
        <Link href="/sobre" className="underline">
          Contato
        </Link>
      </p>
    </Card>
  );
}
