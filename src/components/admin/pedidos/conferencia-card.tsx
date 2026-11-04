"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhotoGallery } from "@/components/shared/photo-gallery";
import { orderItemRows, type OrderItemRow } from "@/components/sections/order-item-rows";
import {
  AdminError,
  deleteOrderPhoto,
  saveItemChecks,
  uploadOrderPhoto,
  type AdminOrder,
  type OrderHandling,
} from "@/lib/admin/api";
import { checkSummary, divergenceText, type ItemKind } from "@/lib/admin/handling";
import { cn } from "@/lib/utils";
import { useCan } from "@/lib/admin/access-provider";

const errorText = (err: unknown, fallback: string) =>
  err instanceof AdminError ? err.message : fallback;

/** Botão de foto: abre a câmera no celular (no computador, o seletor de arquivos). */
function PhotoButton({
  disabled,
  onPick,
  label = "Foto",
}: {
  disabled: boolean;
  onPick: (files: File[]) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Campo de arquivo fora da tela (display: none) e aberto pelo botão: um campo
  // só "visualmente escondido" recebia foco e fazia a moldura do backoffice rolar.
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onPick(files);
        }}
      />
    </>
  );
}

export function ConferenciaCard({
  order,
  handling,
  storeName,
  onChanged,
}: {
  order: AdminOrder;
  handling: OrderHandling;
  storeName: (code: string) => string;
  onChanged: () => Promise<void>;
}) {
  const rows = orderItemRows(order.ordersByStore);
  const canEdit = useCan("pedidos", "edit");
  const canDelete = useCan("pedidos", "delete");
  const saved = new Map(handling.checks.map((c) => [c.itemId, c]));
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(handling.checks.map((c) => [c.itemId, String(c.receivedQty)])),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(handling.checks.map((c) => [c.itemId, c.note ?? ""])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const summary = checkSummary(handling.checks);
  const photosOf = (id?: string) =>
    handling.photos.filter((p) => (id ? p.itemId === id : !p.itemId));

  async function run(key: string, action: () => Promise<unknown>, fallback: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function upload(files: File[], item?: { kind: ItemKind; id: string }) {
    await run(
      `photo-${item?.id ?? "geral"}`,
      async () => {
        for (const file of files) await uploadOrderPhoto(order.id, file, item);
      },
      "Não foi possível enviar a foto.",
    );
  }

  async function save() {
    const filled = rows.filter((r) => (received[r.id] ?? "").trim() !== "");
    if (filled.length === 0) {
      setError("Informe a quantidade recebida de pelo menos um item.");
      return;
    }
    const invalid = filled.find((r) => !/^\d+$/.test(received[r.id].trim()));
    if (invalid) {
      setError(`Confira a quantidade de "${invalid.label}".`);
      return;
    }
    const ok = await run(
      "save",
      () =>
        saveItemChecks(
          order.id,
          filled.map((r) => ({
            kind: r.kind,
            itemId: r.id,
            receivedQty: Number(received[r.id].trim()),
            note: notes[r.id]?.trim() || undefined,
          })),
        ),
      "Não foi possível salvar a conferência.",
    );
    if (ok) setMessage("Conferência salva.");
  }

  function fillExpected() {
    setReceived((prev) => {
      const next = { ...prev };
      for (const r of rows)
        if (!(next[r.id] ?? "").trim()) next[r.id] = String(r.quantity);
      return next;
    });
  }

  const byStore = rows.reduce<Record<string, OrderItemRow[]>>((acc, r) => {
    (acc[r.storeCode] ??= []).push(r);
    return acc;
  }, {});

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Conferência
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {summary.checked === 0
              ? "Ainda não conferido."
              : summary.divergent > 0
                ? `${summary.checked} de ${rows.length} conferidos · ${summary.divergent} com divergência`
                : `${summary.checked} de ${rows.length} conferidos · tudo conforme o pedido`}
          </p>
        </div>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" onClick={fillExpected}>
            Preencher com o esperado
          </Button>
        )}
      </div>

      {Object.entries(byStore).map(([storeCode, items]) => (
        <div key={storeCode} className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-800">{storeName(storeCode)}</p>
          {items.map((item) => {
            const check = saved.get(item.id);
            const value = received[item.id] ?? "";
            const divergent =
              value.trim() !== "" &&
              /^\d+$/.test(value.trim()) &&
              Number(value) !== item.quantity;
            return (
              <div
                key={item.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3",
                  divergent ? "border-amber-300 bg-amber-50/60" : "border-slate-200",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm text-slate-800">{item.label}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Esperado {item.quantity}</span>
                    <label className="sr-only" htmlFor={`recv-${item.id}`}>
                      Recebido de {item.label}
                    </label>
                    <Input
                      id={`recv-${item.id}`}
                      inputMode="numeric"
                      placeholder="Recebido"
                      disabled={!canEdit}
                      value={value}
                      onChange={(e) =>
                        setReceived((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="h-8 w-24 bg-white text-sm"
                    />
                    <PhotoButton
                      disabled={!!busy || !canEdit}
                      onPick={(files) =>
                        void upload(files, { kind: item.kind, id: item.id })
                      }
                    />
                  </div>
                </div>
                <Input
                  placeholder="Observação (opcional)"
                  disabled={!canEdit}
                  maxLength={500}
                  value={notes[item.id] ?? ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  className="h-8 bg-white text-sm"
                />
                {divergent && (
                  <p className="text-xs font-medium text-amber-700">
                    {divergenceText({
                      expectedQty: item.quantity,
                      receivedQty: Number(value),
                    })}
                  </p>
                )}
                {check && (
                  <p className="text-xs text-slate-400">
                    Salvo em {new Date(check.checkedAt).toLocaleString("pt-BR")}
                  </p>
                )}
                <PhotoGallery
                  photos={photosOf(item.id)}
                  title={item.label}
                  disabled={!!busy}
                  onDelete={
                    !canDelete
                      ? undefined
                      : (photo) =>
                          void run(
                            photo.id,
                            () => deleteOrderPhoto(photo.id),
                            "Não foi possível apagar a foto.",
                          )
                  }
                />
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">Fotos gerais do pacote</p>
          <PhotoButton
            disabled={!!busy || !canEdit}
            onPick={(files) => void upload(files)}
            label="Foto geral"
          />
        </div>
        <PhotoGallery
          photos={photosOf()}
          title="pacote"
          disabled={!!busy}
          onDelete={
            !canDelete
              ? undefined
              : (photo) =>
                  void run(
                    photo.id,
                    () => deleteOrderPhoto(photo.id),
                    "Não foi possível apagar a foto.",
                  )
          }
        />
      </div>

      {busy?.startsWith("photo") && (
        <p className="text-sm text-slate-500">Enviando foto...</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {canEdit && (
        <Button
          type="button"
          className="self-start"
          disabled={!!busy}
          onClick={() => void save()}
        >
          {busy === "save" ? "Salvando..." : "Salvar conferência"}
        </Button>
      )}
      <p className="text-xs text-slate-400">
        O cliente vê as fotos e as divergências na página do pedido.
      </p>
    </Card>
  );
}
