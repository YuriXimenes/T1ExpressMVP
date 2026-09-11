"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FreightStoreCard } from "@/components/shared/freight-store-card";
import type { FreightStore } from "@/lib/types/freight-store";

export function FreightStorePickerDialog({
  open,
  onOpenChange,
  stores,
  selectedIds,
  excludedId,
  onConfirm,
  title = "Onde estão suas cartas?",
  description = "Selecione uma ou mais lojas de coleta. Você pode combinar quantas precisar.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: FreightStore[];
  selectedIds: string[];
  /** Loja que não pode ser escolhida aqui por já estar selecionada em outro campo. */
  excludedId?: string;
  onConfirm: (ids: string[]) => void;
  title?: string;
  description?: string;
}) {
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraftIds(selectedIds);
  }

  function toggle(id: string) {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 grid grid-cols-2 gap-3 overflow-y-auto px-1 py-1 sm:grid-cols-3">
          {stores.map((store) => (
            <FreightStoreCard
              key={store.id}
              store={store}
              selected={draftIds.includes(store.id)}
              disabledLabel={store.id === excludedId ? "Já é o destino" : undefined}
              onToggle={() => toggle(store.id)}
            />
          ))}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            {draftIds.length === 0
              ? "Nenhuma loja selecionada"
              : `${draftIds.length} loja${draftIds.length > 1 ? "s" : ""} selecionada${draftIds.length > 1 ? "s" : ""}`}
          </span>
          <Button
            type="button"
            disabled={draftIds.length === 0}
            onClick={() => {
              onConfirm(draftIds);
              onOpenChange(false);
            }}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
