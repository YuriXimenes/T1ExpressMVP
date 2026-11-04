"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEventTime } from "@/components/admin/pedidos/order-timeline";
import { useCatalog } from "@/lib/catalog/provider";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError, addCustodyEvent, type OrderHandling } from "@/lib/admin/api";
import { CUSTODY_ACTIONS, custodyLabel, type CustodyAction } from "@/lib/admin/handling";

const NONE = "none";

/** Quem estava com o pacote, onde e quando. Só cresce: corrigir = registrar de novo. */
export function CustodyCard({
  orderId,
  handling,
  onChanged,
}: {
  orderId: string;
  handling: OrderHandling;
  onChanged: () => Promise<void>;
}) {
  const { stores } = useCatalog();
  const canEdit = useCan("pedidos", "edit");
  const [action, setAction] = useState<CustodyAction | "">("");
  const [storeCode, setStoreCode] = useState(NONE);
  const [location, setLocation] = useState("");
  const [responsible, setResponsible] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  async function submit() {
    if (!action) {
      setError("Escolha a movimentação.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addCustodyEvent(orderId, {
        action,
        storeCode: storeCode === NONE ? undefined : storeCode,
        location: location.trim() || undefined,
        responsible: responsible.trim() || undefined,
        note: note.trim() || undefined,
      });
      setAction("");
      setStoreCode(NONE);
      setLocation("");
      setNote("");
      await onChanged();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-4 p-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        Custódia
      </p>

      {handling.custody.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma movimentação registrada.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {handling.custody.map((event) => (
            <li key={event.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm font-medium text-slate-900">
                {custodyLabel(event.action)}
              </p>
              <p className="text-sm text-slate-600">
                {[
                  event.storeCode && storeName(event.storeCode),
                  event.location,
                  event.responsible && `Responsável: ${event.responsible}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {event.note && <p className="text-sm text-slate-600">{event.note}</p>}
              <p className="text-xs text-slate-400">
                {formatEventTime(event.createdAt)}
                {event.recordedByName && ` · registrado por ${event.recordedByName}`}
              </p>
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">Registrar movimentação</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="custody-action" className="text-xs text-slate-500">
                Movimentação
              </Label>
              <Select value={action} onValueChange={(v) => setAction(v as CustodyAction)}>
                <SelectTrigger id="custody-action" className="h-8 w-full bg-white">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTODY_ACTIONS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="custody-store" className="text-xs text-slate-500">
                Loja (opcional)
              </Label>
              <Select value={storeCode} onValueChange={setStoreCode}>
                <SelectTrigger id="custody-store" className="h-8 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {[...stores]
                    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="custody-location" className="text-xs text-slate-500">
                Outro local (opcional)
              </Label>
              <Input
                id="custody-location"
                maxLength={200}
                placeholder="Ex.: base T1 Centro"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-8 bg-white text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="custody-responsible" className="text-xs text-slate-500">
                Responsável (quem está com o pacote)
              </Label>
              <Input
                id="custody-responsible"
                maxLength={120}
                placeholder="Ex.: João (entregador)"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className="h-8 bg-white text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="custody-note" className="text-xs text-slate-500">
              Observação{action === "outro" ? " (obrigatória)" : " (opcional)"}
            </Label>
            <Input
              id="custody-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 bg-white text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            className="self-start"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Registrando..." : "Registrar"}
          </Button>
        </div>
      )}
    </Card>
  );
}
