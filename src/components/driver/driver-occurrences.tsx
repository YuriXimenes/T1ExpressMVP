"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { currentPosition, type DriverStop } from "@/lib/driver/api";
import {
  OccurrenceError,
  driverOpenOccurrence,
  fetchDriverOccurrences,
  fetchOccurrenceTypes,
  uploadOccurrenceFile,
  type Occurrence,
  type OccurrenceType,
} from "@/lib/occurrences/api";
import { occurrenceCode } from "@/lib/occurrences/rules";
import { cn } from "@/lib/utils";
import {
  OccurrenceStatusBadge,
  OccurrenceThread,
  dateTime,
} from "@/components/occurrences/occurrence-thread";

const ALL_ORDERS = "all";

/** Relatar ocorrência numa parada: tipo, pedido (opcional), descrição, foto e GPS. */
export function DriverReportDialog({
  stop,
  onClose,
  onCreated,
}: {
  stop: DriverStop;
  onClose: () => void;
  onCreated: (number: number) => void;
}) {
  const [types, setTypes] = useState<OccurrenceType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [orderId, setOrderId] = useState(ALL_ORDERS);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchOccurrenceTypes("driver")
        .then(setTypes)
        .catch(() => setError("Não foi possível carregar os tipos."));
    });
  }, []);

  const selectedType = types.find((t) => t.id === typeId);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!typeId) return setError("Escolha o que aconteceu.");
    if (description.trim().length < 3) return setError("Descreva o que aconteceu.");
    if (selectedType?.requiresPhoto && files.length === 0) {
      return setError("Este tipo exige ao menos uma foto.");
    }
    setBusy(true);
    try {
      const at = await currentPosition();
      const created = await driverOpenOccurrence({
        typeId,
        stopId: stop.id,
        orderId: orderId === ALL_ORDERS ? undefined : orderId,
        description: description.trim(),
        lat: at?.lat,
        lng: at?.lng,
      });
      for (const file of files) await uploadOccurrenceFile(created.id, file);
      onCreated(created.number);
    } catch (err) {
      setError(err instanceof OccurrenceError ? err.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !busy && !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Relatar ocorrência</DialogTitle>
          <DialogDescription>{stop.store.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>O que aconteceu</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger aria-label="O que aconteceu">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stop.orders.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Pedido</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger aria-label="Pedido">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ORDERS}>A parada toda</SelectItem>
                  {stop.orders.map((o) => (
                    <SelectItem key={o.orderId} value={o.orderId}>
                      #{o.code}
                      {o.customerFirstName ? ` (${o.customerFirstName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drv-occ-desc">Descrição</Label>
            <Textarea
              id="drv-occ-desc"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drv-occ-files">
              Foto {selectedType?.requiresPhoto ? "(obrigatório)" : "(opcional)"}
            </Label>
            <Input
              id="drv-occ-files"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>
          <p className="text-xs text-slate-500">
            A localização do celular vai junto, se permitida.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ocorrências que o entregador abriu ou que são das paradas dele (últimos 60 dias). */
export function DriverOccurrencesList({ onBack }: { onBack: () => void }) {
  const [list, setList] = useState<Occurrence[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setList(await fetchDriverOccurrences());
    } catch (err) {
      setError(
        err instanceof OccurrenceError ? err.message : "Não foi possível carregar.",
      );
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="text-brand-700 self-start text-sm"
      >
        ← Suas viagens
      </button>
      <h1 className="text-lg font-semibold text-slate-900">Minhas ocorrências</h1>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!list && !error && <p className="text-sm text-slate-500">Carregando...</p>}
      {list && list.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma ocorrência nos últimos 60 dias.</p>
      )}
      {(list ?? []).map((o) => {
        const expanded = openId === o.id;
        return (
          <div key={o.id} className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpenId(expanded ? null : o.id)}
              className="flex w-full items-center gap-2 p-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-900">
                    {occurrenceCode(o.number)}
                  </span>
                  <span className="text-slate-700">{o.typeName}</span>
                  <OccurrenceStatusBadge occurrence={o} />
                </span>
                <span className="text-xs text-slate-500">
                  {o.storeName && `${o.storeName} · `}
                  {dateTime(o.createdAt)}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform",
                  expanded && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            {expanded && (
              <div className="flex flex-col gap-3 border-t border-slate-100 p-4">
                <p className="text-sm whitespace-pre-wrap text-slate-700">
                  {o.description}
                </p>
                <OccurrenceThread occurrence={o} viewer="driver" onChanged={load} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
