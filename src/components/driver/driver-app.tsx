"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  History,
  Home,
  LogOut,
  Map as MapIcon,
  Wallet,
  MapPin,
  Navigation,
  QrCode,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  DriverError,
  currentPosition,
  fetchDriverAccess,
  fetchDriverEarnings,
  fetchDriverTrips,
  finishTrip,
  recordStop,
  startTrip,
  uploadStopPhoto,
  type DriverAccess,
  type DriverEarnings as DriverEarningsData,
  type DriverStop,
  type DriverTrip,
} from "@/lib/driver/api";
import {
  STOP_REASONS,
  STOP_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  stopReasonLabel,
} from "@/lib/routes/planning";
import { cn } from "@/lib/utils";
import {
  DriverOccurrencesList,
  DriverReportDialog,
} from "@/components/driver/driver-occurrences";
import { DriverMapTab } from "@/components/driver/driver-map-tab";
import { DriverHistory } from "@/components/driver/driver-history";
import { DriverEarnings } from "@/components/driver/driver-earnings";
import { useGpsTracking, type GpsStatus } from "@/components/driver/use-gps-tracking";
import { agoLabel, mapTrip, splitTodayTrips } from "@/lib/driver/rules";

const errorText = (err: unknown, fallback: string) =>
  err instanceof DriverError ? err.message : fallback;

const time = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });

function mapsUrl(stop: DriverStop): string {
  const s = stop.store;
  const destination =
    s.lat !== undefined && s.lng !== undefined
      ? `${s.lat},${s.lng}`
      : encodeURIComponent(`${s.address}, ${s.city}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

type DriverTab = "hoje" | "mapa" | "historico" | "ganhos";

const GPS_TEXT: Record<GpsStatus, string> = {
  desligado: "",
  procurando: "Procurando o sinal do GPS...",
  ativo: "GPS ativo",
  negado:
    "Localização bloqueada. Libere a localização deste site no navegador para a T1 acompanhar a viagem.",
  indisponivel: "Este celular não informa a localização pelo navegador.",
};

/** Área do entregador: hoje, mapa, histórico e ganhos (quando liberado). */
export function DriverApp() {
  const router = useRouter();
  const { isReady, isLoggedIn, user, logout } = useAuth();
  const [access, setAccess] = useState<DriverAccess | null | undefined>(undefined);
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [earnings, setEarnings] = useState<DriverEarningsData>({ enabled: false });
  const [tab, setTab] = useState<DriverTab>("hoje");
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [showOccurrences, setShowOccurrences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [now, setNow] = useState(0);

  async function load() {
    try {
      const me = await fetchDriverAccess();
      setAccess(me);
      if (me) {
        const [list, earn] = await Promise.all([
          fetchDriverTrips(),
          fetchDriverEarnings(),
        ]);
        setTrips(list);
        setEarnings(earn);
        setToday(
          new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
        );
      }
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar as suas viagens."));
    }
  }

  useEffect(() => {
    if (!isReady) return;
    if (!isLoggedIn) {
      router.replace("/login?next=%2Fentregador");
      return;
    }
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isLoggedIn]);

  const running = trips?.find((t) => t.status === "em_andamento");
  const gps = useGpsTracking(running?.id);

  // Relógio do aviso "último envio há X" (sem Date.now() durante o render).
  useEffect(() => {
    if (!gps.lastSentAt) return;
    const tick = () => setNow(Date.now());
    queueMicrotask(tick);
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [gps.lastSentAt]);

  async function signOut() {
    await logout();
    router.replace("/login?next=%2Fentregador");
  }

  const trip = trips?.find((t) => t.id === openTripId);
  const split = splitTodayTrips(trips ?? [], today);
  const tabs: { id: DriverTab; label: string; icon: typeof Home }[] = [
    { id: "hoje", label: "Hoje", icon: Home },
    { id: "mapa", label: "Mapa", icon: MapIcon },
    { id: "historico", label: "Histórico", icon: History },
    ...(earnings.enabled
      ? [{ id: "ganhos" as const, label: "Ganhos", icon: Wallet }]
      : []),
  ];

  function tripCard(t: DriverTrip) {
    const stops = t.routes.flatMap((r) => r.stops);
    const done = stops.filter(
      (s) => s.status !== "aguardando" && s.status !== "em_deslocamento",
    ).length;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => setOpenTripId(t.id)}
        className={cn(
          "flex flex-col gap-1 rounded-xl border bg-white p-4 text-left",
          t.status === "em_andamento"
            ? "border-brand-300 ring-brand-100 ring-2"
            : "border-slate-200",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-slate-900 capitalize">
            {dayLabel(t.day)}
            {split.isLate(t) && (
              <span className="ml-1.5 text-xs font-medium text-amber-700 normal-case">
                · de outro dia
              </span>
            )}
          </p>
          <Badge variant={t.status === "em_andamento" ? "default" : "secondary"}>
            {TRIP_STATUS_LABELS[t.status] ?? t.status}
          </Badge>
        </div>
        <p className="text-sm text-slate-600">
          {t.routes
            .map(
              (r) =>
                `${r.kind === "coleta" ? "Coletas" : "Entregas"} (${r.stops.length})`,
            )
            .join(" + ")}
          {t.plannedStartAt && ` · saída ${time(t.plannedStartAt)}`}
        </p>
        <p className="text-xs text-slate-500">
          {done} de {stops.length} paradas registradas
          {t.vehicle && ` · ${t.vehicle}`}
          {t.status === "concluida" && t.actualKm !== undefined && ` · ${t.actualKm} km`}
        </p>
      </button>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand-600 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white">
            T1
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Entregador</p>
            <p className="text-xs text-slate-500">{access?.name ?? user?.name ?? ""}</p>
          </div>
        </div>
        {isLoggedIn && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </Button>
        )}
      </header>

      {running && gps.status !== "desligado" && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 border-b px-4 py-2 text-xs",
            gps.status === "ativo"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : gps.status === "procurando"
                ? "border-slate-200 bg-white text-slate-600"
                : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {GPS_TEXT[gps.status]}
            {gps.status === "ativo" &&
              gps.lastSentAt &&
              now > 0 &&
              ` · último envio ${agoLabel(new Date(gps.lastSentAt).toISOString(), now)}`}
            {gps.status === "ativo" &&
              ". Deixe o app aberto na tela: com o celular bloqueado o envio pausa e volta ao abrir."}
          </span>
        </div>
      )}

      <main id="main-content" className="flex flex-1 flex-col gap-4 p-4 pb-24">
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {access === undefined && !error && (
          <p className="text-sm text-slate-500">Carregando...</p>
        )}
        {access === null && (
          <Card className="p-6 text-center">
            <p className="font-semibold text-slate-900">
              Sem acesso à área do entregador
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Esta conta ({user?.email}) não está ligada a um entregador ativo da equipe.
              Peça para a T1 ligar a sua conta em Pessoas › Equipe.
            </p>
          </Card>
        )}

        {access && tab === "hoje" && showOccurrences && (
          <DriverOccurrencesList onBack={() => setShowOccurrences(false)} />
        )}

        {access && tab === "hoje" && trips && !trip && !showOccurrences && (
          <>
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-semibold text-slate-900">Hoje</h1>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowOccurrences(true)}
              >
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                Minhas ocorrências
              </Button>
            </div>
            {trips.length === 0 && (
              <p className="text-sm text-slate-500">
                Nenhuma viagem para hoje. Viagens anteriores ficam no Histórico.
              </p>
            )}
            {split.showSections && split.todo.length > 0 && (
              <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                A fazer ({split.todo.length})
              </h2>
            )}
            {split.todo.map(tripCard)}
            {split.showSections && split.done.length > 0 && (
              <h2 className="mt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Concluídas ({split.done.length})
              </h2>
            )}
            {split.done.map(tripCard)}
          </>
        )}

        {access && tab === "hoje" && trip && !showOccurrences && (
          <TripScreen
            trip={trip}
            onBack={() => setOpenTripId(null)}
            onChanged={async () => setTrips(await fetchDriverTrips())}
          />
        )}

        {access && tab === "mapa" && (
          <DriverMapTab trip={mapTrip(trips ?? [])} gps={gps} />
        )}
        {access && tab === "historico" && <DriverHistory />}
        {access && tab === "ganhos" && earnings.enabled && (
          <DriverEarnings months={earnings.months} />
        )}
      </main>

      {access && (
        <nav
          aria-label="Seções"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-lg border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                if (id === "hoje") setShowOccurrences(false);
              }}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                tab === id ? "text-brand-700" : "text-slate-500",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function TripScreen({
  trip,
  onBack,
  onChanged,
}: {
  trip: DriverTrip;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [odometerFor, setOdometerFor] = useState<"start" | "finish" | null>(null);
  const [odometer, setOdometer] = useState("");
  const [stop, setStop] = useState<{
    stop: DriverStop;
    kind: "coleta" | "entrega";
  } | null>(null);
  const [reportFor, setReportFor] = useState<DriverStop | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stops = trip.routes.flatMap((r) => r.stops);
  const pending = stops.filter(
    (s) => s.status === "aguardando" || s.status === "em_deslocamento",
  );
  const running = trip.status === "em_andamento";
  // Loja com coleta e entrega na mesma viagem: faz as duas na mesma passada.
  const storesOf = (kind: string) =>
    new Set(
      trip.routes
        .filter((r) => r.kind === kind)
        .flatMap((r) => r.stops.map((st) => `${st.store.name}|${st.store.address}`)),
    );
  const collectStores = storesOf("coleta");
  const deliverStores = storesOf("entrega");

  async function submitOdometer() {
    const value = Number(odometer.replace(",", "."));
    if (!odometer || !Number.isFinite(value)) {
      setError("Informe o odômetro.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const at = await currentPosition();
      if (odometerFor === "start") await startTrip(trip.id, value, at);
      else await finishTrip(trip.id, value, at);
      setOdometerFor(null);
      setOdometer("");
      await onChanged();
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="text-brand-700 self-start text-sm"
      >
        ← Suas viagens
      </button>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 capitalize">
          {dayLabel(trip.day)}
        </h1>
        <p className="text-sm text-slate-600">
          {TRIP_STATUS_LABELS[trip.status] ?? trip.status}
          {trip.vehicle && ` · ${trip.vehicle}`}
          {trip.odometerStart !== undefined &&
            trip.odometerStart !== null &&
            ` · saiu com ${trip.odometerStart} km`}
        </p>
        {trip.notes && (
          <p className="mt-1 rounded-md bg-amber-50 p-2 text-sm text-amber-900">
            {trip.notes}
          </p>
        )}
      </div>

      {error && !odometerFor && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {trip.status === "enviada" && (
        <Button type="button" size="lg" onClick={() => setOdometerFor("start")}>
          Iniciar viagem
        </Button>
      )}

      {trip.routes.map((route) => (
        <section key={route.id} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
            {route.kind === "coleta" ? "Coletas" : "Entregas"}
          </h2>
          {route.kind === "entrega" && running && (
            <p className="bg-brand-50 text-brand-900 flex items-start gap-2 rounded-lg p-3 text-sm">
              <QrCode className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              No ponto de retirada, aponte a câmera do celular para o QR do pacote: a
              entrega é confirmada por ele.
            </p>
          )}
          {route.stops.map((s, i) => {
            const isPending = s.status === "aguardando" || s.status === "em_deslocamento";
            return (
              <Card key={s.id} className={cn("gap-2 p-4", !isPending && "bg-slate-50")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {i + 1}. {s.store.name}
                    </p>
                    {(route.kind === "coleta" ? deliverStores : collectStores).has(
                      `${s.store.name}|${s.store.address}`,
                    ) && (
                      <p className="mt-0.5 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                        {route.kind === "coleta"
                          ? "Também tem entrega aqui"
                          : "Também tem coleta aqui"}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">
                      {s.store.address}
                      {s.store.neighborhood && ` · ${s.store.neighborhood}`}
                    </p>
                    {s.plannedAt && (
                      <p className="text-xs text-slate-500">
                        Previsto {time(s.plannedAt)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      s.status === "nao_realizada"
                        ? "destructive"
                        : isPending
                          ? "default"
                          : "secondary"
                    }
                  >
                    {STOP_STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-700">
                  {s.orders
                    .map(
                      (o) =>
                        `#${o.code}${o.customerFirstName ? ` (${o.customerFirstName})` : ""}`,
                    )
                    .join(", ")}
                </p>
                {s.reason && (
                  <p className="text-sm text-red-700">{stopReasonLabel(s.reason)}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={mapsUrl(s)} target="_blank" rel="noreferrer">
                      <Navigation className="h-4 w-4" aria-hidden="true" />
                      Como chegar
                    </a>
                  </Button>
                  {running && isPending && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setStop({ stop: s, kind: route.kind })}
                    >
                      {route.kind === "coleta" ? "Registrar coleta" : "Registrar entrega"}
                    </Button>
                  )}
                  {(running || trip.status === "concluida") && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotice(null);
                        setReportFor(s);
                      }}
                    >
                      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                      Relatar ocorrência
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </section>
      ))}

      {running && (
        <Button
          type="button"
          size="lg"
          variant={pending.length ? "outline" : "default"}
          disabled={pending.length > 0}
          onClick={() => setOdometerFor("finish")}
        >
          {pending.length
            ? `Faltam ${pending.length} parada(s) para finalizar`
            : "Finalizar viagem"}
        </Button>
      )}
      {reportFor && (
        <DriverReportDialog
          stop={reportFor}
          onClose={() => setReportFor(null)}
          onCreated={(number) => {
            setReportFor(null);
            setNotice(
              `Ocorrência OC-${number} enviada. Acompanhe em “Minhas ocorrências”.`,
            );
          }}
        />
      )}
      {trip.status === "concluida" && (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Viagem concluída. Obrigado!
        </p>
      )}

      <Dialog
        open={!!odometerFor}
        onOpenChange={(v) => !busy && !v && setOdometerFor(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {odometerFor === "start" ? "Iniciar viagem" : "Finalizar viagem"}
            </DialogTitle>
            <DialogDescription>
              Informe o odômetro do veículo agora (
              {odometerFor === "start" ? "antes de sair" : "na chegada"}).
            </DialogDescription>
          </DialogHeader>
          <Input
            inputMode="decimal"
            placeholder="Ex.: 12345"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className="h-12 text-lg"
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOdometerFor(null)}
            >
              Voltar
            </Button>
            <Button type="button" disabled={busy} onClick={() => void submitOdometer()}>
              {busy ? "Salvando..." : odometerFor === "start" ? "Iniciar" : "Finalizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {stop && (
        <StopDialog
          stop={stop.stop}
          kind={stop.kind}
          onClose={() => setStop(null)}
          onDone={async () => {
            setStop(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function StopDialog({
  stop,
  kind,
  onClose,
  onDone,
}: {
  stop: DriverStop;
  kind: "coleta" | "entrega";
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const open = stop.orders.filter((o) => !o.result);
  const [ok, setOk] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(open.map((o) => [o.orderId, true])),
  );
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anyFail = open.some((o) => !ok[o.orderId]);

  async function addPhotos(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        await uploadStopPhoto(stop.id, file);
        setPhotos((n) => n + 1);
      }
    } catch (err) {
      setError(errorText(err, "Não foi possível enviar a foto."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (anyFail && !reason) {
      setError("Escolha o motivo dos pedidos que não saíram.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordStop(stop.id, {
        orders: open.map((o) => ({ orderId: o.orderId, ok: !!ok[o.orderId] })),
        contactName: contact.trim() || undefined,
        reason: anyFail ? reason : undefined,
        note: note.trim() || undefined,
        at: await currentPosition(),
      });
      await onDone();
    } catch (err) {
      setError(errorText(err, "Não foi possível registrar a parada."));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !busy && !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stop.store.name}</DialogTitle>
          <DialogDescription>
            {kind === "coleta"
              ? "Marque os pedidos que você pegou nesta loja."
              : "Marque os pedidos entregues neste ponto."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {open.map((o) => (
              <li key={o.orderId}>
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-base">
                  <input
                    type="checkbox"
                    className="accent-brand-600 h-5 w-5"
                    checked={!!ok[o.orderId]}
                    onChange={(e) =>
                      setOk((prev) => ({ ...prev, [o.orderId]: e.target.checked }))
                    }
                  />
                  <span className="font-medium">#{o.code}</span>
                  {o.customerFirstName && (
                    <span className="text-slate-500">{o.customerFirstName}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-contact">
              {kind === "coleta" ? "Quem entregou na loja" : "Quem recebeu no ponto"}
            </Label>
            <Input
              id="stop-contact"
              maxLength={120}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          {anyFail && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stop-reason">Motivo dos que não saíram</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="stop-reason" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {STOP_REASONS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stop-note">
              Observação{reason === "outro" ? " (obrigatória)" : " (opcional)"}
            </Label>
            <Textarea
              id="stop-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-700",
              busy && "pointer-events-none opacity-50",
            )}
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            {photos ? `${photos} foto(s) enviada(s) · tirar outra` : "Foto do pacote"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                if (files.length) void addPhotos(files);
              }}
            />
          </label>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />A localização do celular
            é registrada junto, se você permitir.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Voltar
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
