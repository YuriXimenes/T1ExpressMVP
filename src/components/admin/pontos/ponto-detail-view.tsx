"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PeriodFilter, usePeriodFilter } from "@/components/admin/period-filter";
import { NewOccurrenceDialog } from "@/components/admin/ocorrencias/new-occurrence-dialog";
import { dateTime } from "@/components/occurrences/occurrence-thread";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError } from "@/lib/admin/api";
import { dayKey } from "@/lib/admin/dashboard";
import { orderCode } from "@/lib/admin/order-moves";
import { addDays } from "@/lib/operating-calendar";
import {
  extendGuard,
  fetchPickupPoints,
  fetchPointPackages,
  fetchPointPickups,
  updatePickupPoint,
  type PickupPoint,
  type PointPackage,
  type PointPickup,
} from "@/lib/points/api";
import {
  GUARD_STATE_LABELS,
  WEEKDAY_LABELS,
  daysWaiting,
  guardState,
  hoursLabel,
} from "@/lib/points/guard";
import { cn } from "@/lib/utils";

type Tab = "pacotes" | "retiradas" | "config";
const errorText = (err: unknown, fallback: string) =>
  err instanceof AdminError ? err.message : fallback;

export function PontoDetailView({ code }: { code: string }) {
  const router = useRouter();
  const canEdit = useCan("pontos", "edit");
  const canOpenOccurrence = useCan("ocorrencias", "create");
  const [tab, setTab] = useState<Tab>("pacotes");
  const [point, setPoint] = useState<PickupPoint | null>(null);
  const [packages, setPackages] = useState<PointPackage[] | null>(null);
  const [pickups, setPickups] = useState<PointPickup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const period = usePeriodFilter("30d");
  const [extending, setExtending] = useState<PointPackage | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [occurrenceFor, setOccurrenceFor] = useState<string | null>(null);
  const [config, setConfig] = useState<{
    hours: Record<string, string>;
    capacity: string;
    guardDays: string;
  }>({ hours: {}, capacity: "", guardDays: "7" });

  async function load() {
    try {
      const [all, pkgs] = await Promise.all([
        fetchPickupPoints(),
        fetchPointPackages(code),
      ]);
      const found = all.find((p) => p.code === code) ?? null;
      setPoint(found);
      setPackages(pkgs);
      if (found) {
        setConfig({
          hours: { ...found.hours },
          capacity: found.capacity?.toString() ?? "",
          guardDays: String(found.guardDays),
        });
      } else {
        setError("Ponto de retirada não encontrado.");
      }
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar o ponto."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const from = period.period.from ?? "2020-01-01";
  const to = period.period.to ?? dayKey(new Date());
  useEffect(() => {
    if (tab !== "retiradas") return;
    queueMicrotask(() => {
      fetchPointPickups(code, from, to)
        .then(setPickups)
        .catch((err) =>
          setError(errorText(err, "Não foi possível carregar as retiradas.")),
        );
    });
  }, [tab, code, from, to]);

  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pickups ?? []) {
      const k = dayKey(p.pickedUpAt);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pickups]);
  const maxPerDay = Math.max(1, ...perDay.map(([, n]) => n));
  const avgHours = useMemo(() => {
    const valid = (pickups ?? []).filter((p) => p.availableAt);
    if (valid.length === 0) return undefined;
    return (
      valid.reduce(
        (sum, p) =>
          sum + (new Date(p.pickedUpAt).getTime() - new Date(p.availableAt!).getTime()),
        0,
      ) /
      valid.length /
      3_600_000
    );
  }, [pickups]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(done);
      return true;
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/pedidos/pontos"
        className="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Pontos de retirada
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {point?.name ?? "Ponto de retirada"}
        </h1>
        {point && (
          <p className="text-sm text-slate-500">
            {point.address}
            {point.neighborhood && ` · ${point.neighborhood}`} · {point.city} · guarda de{" "}
            {point.guardDays} dias
            {point.capacity && ` · capacidade ${point.capacity}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Seções do ponto">
        {(
          [
            ["pacotes", `Pacotes${packages ? ` (${packages.length})` : ""}`],
            ["retiradas", "Retiradas"],
            ["config", "Configurações"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              tab === id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {tab === "pacotes" && (
        <div className="flex flex-col gap-2">
          {!packages && !error && <p className="text-sm text-slate-500">Carregando...</p>}
          {packages && packages.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum pacote aguardando retirada.</p>
          )}
          {(packages ?? []).map((pkg) => {
            const state = guardState(pkg.guardUntil);
            return (
              <Card
                key={pkg.orderId}
                className="flex-row flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/pedidos/${pkg.orderId}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      #{orderCode(pkg.orderId)}
                    </Link>
                    <span className="truncate text-sm text-slate-600">
                      {pkg.customerName}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        state === "expired"
                          ? "bg-red-50 text-red-700"
                          : state === "today"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700",
                      )}
                    >
                      {GUARD_STATE_LABELS[state]}
                    </span>
                    {pkg.openOccurrenceId && (
                      <Link
                        href={`/admin/pedidos/ocorrencias/${pkg.openOccurrenceId}`}
                        className="text-xs font-medium text-amber-700 hover:underline"
                      >
                        Ocorrência aberta
                      </Link>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    No ponto desde {dateTime(pkg.availableAt)} (
                    {daysWaiting(pkg.availableAt)} dia(s)) · retirar até{" "}
                    {dateTime(pkg.guardUntil)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setExtendDate(addDays(dayKey(new Date()), 3));
                        setExtendReason("");
                        setExtending(pkg);
                      }}
                    >
                      Prorrogar prazo
                    </Button>
                  )}
                  {canOpenOccurrence && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOccurrenceFor(pkg.orderId)}
                    >
                      Abrir ocorrência
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "retiradas" && (
        <div className="flex flex-col gap-4">
          <PeriodFilter state={period} idPrefix="ponto-retiradas" />
          {!pickups && <p className="text-sm text-slate-500">Carregando...</p>}
          {pickups && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Retiradas no período</p>
                  <p className="text-xl font-semibold text-slate-900">{pickups.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Tempo médio até a retirada</p>
                  <p className="text-xl font-semibold text-slate-900">
                    {hoursLabel(avgHours)}
                  </p>
                </div>
              </div>
              {perDay.length > 0 && (
                <Card className="gap-2 p-4">
                  <p className="text-sm font-medium text-slate-700">Retiradas por dia</p>
                  <ul className="flex flex-col gap-1">
                    {perDay.map(([day, n]) => (
                      <li key={day} className="flex items-center gap-2 text-xs">
                        <span className="w-12 shrink-0 text-slate-500">
                          {day.slice(8, 10)}/{day.slice(5, 7)}
                        </span>
                        <span
                          className="bg-brand-500 h-3 rounded-sm"
                          style={{ width: `${(n / maxPerDay) * 100}%`, minWidth: 4 }}
                        />
                        <span className="text-slate-700">{n}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {pickups.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma retirada no período.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {pickups.map((p) => (
                    <div
                      key={p.orderId}
                      className="flex flex-wrap items-center gap-x-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <Link
                        href={`/admin/pedidos/${p.orderId}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        #{orderCode(p.orderId)}
                      </Link>
                      <span className="text-slate-600">{p.customerName}</span>
                      <span className="text-xs text-slate-500">
                        Retirado {dateTime(p.pickedUpAt)}
                        {p.availableAt &&
                          ` · esperou ${hoursLabel(
                            (new Date(p.pickedUpAt).getTime() -
                              new Date(p.availableAt).getTime()) /
                              3_600_000,
                          )}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "config" && point && (
        <Card className="gap-4 p-5 sm:max-w-xl">
          <fieldset disabled={!canEdit || busy} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-slate-700">Horário de retirada</p>
              <p className="text-xs text-slate-500">
                Deixe vazio o dia em que o ponto não abre.
              </p>
              {WEEKDAY_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-3">
                  <Label htmlFor={`hours-${i}`} className="w-20 text-sm text-slate-600">
                    {label}
                  </Label>
                  <Input
                    id={`hours-${i}`}
                    className="h-8 w-44 text-sm"
                    placeholder="ex.: 10:00–19:00"
                    maxLength={40}
                    value={config.hours[String(i)] ?? ""}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        hours: { ...c.hours, [String(i)]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point-capacity">Capacidade (pacotes)</Label>
                <Input
                  id="point-capacity"
                  inputMode="numeric"
                  placeholder="Sem limite"
                  value={config.capacity}
                  onChange={(e) => setConfig((c) => ({ ...c, capacity: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="point-guard">Prazo de guarda (dias)</Label>
                <Input
                  id="point-guard"
                  inputMode="numeric"
                  value={config.guardDays}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, guardDays: e.target.value }))
                  }
                />
                <p className="text-xs text-slate-500">
                  Vale para os pacotes que chegarem daqui em diante.
                </p>
              </div>
            </div>
            {canEdit && (
              <Button
                className="self-start"
                onClick={() =>
                  void run(
                    () =>
                      updatePickupPoint(code, {
                        hours: config.hours,
                        capacity: config.capacity.trim()
                          ? Number(config.capacity)
                          : undefined,
                        guardDays: Number(config.guardDays),
                      }),
                    "Configurações salvas.",
                  )
                }
              >
                Salvar
              </Button>
            )}
          </fieldset>
        </Card>
      )}

      <Dialog open={extending !== null} onOpenChange={(o) => !o && setExtending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Prorrogar prazo{extending ? ` · #${orderCode(extending.orderId)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extend-date">Retirar até (fim do dia)</Label>
              <Input
                id="extend-date"
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extend-reason">Motivo</Label>
              <Textarea
                id="extend-reason"
                rows={2}
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtending(null)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || !extendDate || extendReason.trim().length < 3}
              onClick={() =>
                extending &&
                void run(
                  () => extendGuard(extending.orderId, extendDate, extendReason.trim()),
                  "Prazo prorrogado.",
                ).then((ok) => ok && setExtending(null))
              }
            >
              Prorrogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewOccurrenceDialog
        open={occurrenceFor !== null}
        onOpenChange={(o) => !o && setOccurrenceFor(null)}
        defaultOrderId={occurrenceFor ?? undefined}
        defaultStoreCode={code}
        onCreated={(id) => router.push(`/admin/pedidos/ocorrencias/${id}`)}
      />
    </div>
  );
}
