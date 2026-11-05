"use client";

import { useEffect, useState } from "react";
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
import { useCatalog } from "@/lib/catalog/provider";
import { fetchAdminOrders } from "@/lib/admin/api";
import { orderCode } from "@/lib/admin/order-moves";
import {
  OccurrenceError,
  fetchOccurrenceTypes,
  openOccurrence,
  uploadOccurrenceFile,
  type OccurrenceType,
} from "@/lib/occurrences/api";
import { deadlineLabel } from "@/lib/occurrences/rules";

const NONE = "none";

/** Abrir ocorrência pelo admin: tipo, pedido (pelo código), loja, descrição e anexos. */
export function NewOccurrenceDialog({
  open,
  onOpenChange,
  defaultOrderId,
  defaultStoreCode,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOrderId?: string;
  defaultStoreCode?: string;
  onCreated: (id: string) => void;
}) {
  const { stores } = useCatalog();
  const [types, setTypes] = useState<OccurrenceType[]>([]);
  const [typeId, setTypeId] = useState("");
  const [code, setCode] = useState("");
  const [storeCode, setStoreCode] = useState(NONE);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setTypeId("");
      setCode(defaultOrderId ? orderCode(defaultOrderId) : "");
      setStoreCode(defaultStoreCode ?? NONE);
      setDescription("");
      setFiles([]);
      setError(null);
      void fetchOccurrenceTypes("all")
        .then((all) => setTypes(all.filter((t) => t.active)))
        .catch(() => setError("Não foi possível carregar os tipos."));
    });
  }, [open, defaultOrderId, defaultStoreCode]);

  const selectedType = types.find((t) => t.id === typeId);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!typeId) return setError("Escolha o tipo.");
    if (description.trim().length < 3) return setError("Descreva a ocorrência.");
    if (selectedType?.requiresPhoto && files.length === 0) {
      return setError("Este tipo exige ao menos uma foto.");
    }
    setBusy(true);
    try {
      let orderId = defaultOrderId;
      const wanted = code.trim().replace(/^#/, "").toUpperCase();
      if (wanted && (!orderId || orderCode(orderId) !== wanted)) {
        const orders = await fetchAdminOrders();
        const matches = orders.filter((o) => orderCode(o.id).startsWith(wanted));
        if (matches.length !== 1) {
          setError(
            matches.length === 0
              ? "Nenhum pedido com esse código."
              : "Mais de um pedido começa assim: digite o código completo.",
          );
          return;
        }
        orderId = matches[0].id;
      }
      if (!wanted) orderId = undefined;
      const created = await openOccurrence({
        typeId,
        orderId,
        storeCode: storeCode === NONE ? undefined : storeCode,
        description: description.trim(),
      });
      for (const file of files) await uploadOccurrenceFile(created.id, file);
      onOpenChange(false);
      onCreated(created.id);
    } catch (err) {
      setError(
        err instanceof OccurrenceError || err instanceof Error
          ? err.message
          : "Não foi possível abrir.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova ocorrência</DialogTitle>
          <DialogDescription>
            O cliente do pedido vê a ocorrência, o status e as atualizações públicas.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger aria-label="Tipo">
                <SelectValue placeholder="Escolha o tipo" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-slate-500">
                Prazo para resolver: {deadlineLabel(selectedType.deadlineHours)}
                {selectedType.requiresPhoto && " · exige foto"}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="occ-order">Pedido (opcional)</Label>
              <Input
                id="occ-order"
                placeholder="Código, ex.: 1A2B3C4D"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Loja ou ponto (opcional)</Label>
              <Select value={storeCode} onValueChange={setStoreCode}>
                <SelectTrigger aria-label="Loja ou ponto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Do pedido / nenhuma</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occ-desc">O que aconteceu</Label>
            <Textarea
              id="occ-desc"
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occ-files">Fotos ou PDF (opcional)</Label>
            <Input
              id="occ-files"
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? "Abrindo..." : "Abrir ocorrência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
