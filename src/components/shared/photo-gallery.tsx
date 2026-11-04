"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { OrderPhoto } from "@/lib/admin/handling";

/** Miniaturas que ampliam ao tocar. `onDelete` só no admin. */
export function PhotoGallery({
  photos,
  title,
  onDelete,
  disabled,
}: {
  photos: OrderPhoto[];
  title: string;
  onDelete?: (photo: OrderPhoto) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<OrderPhoto | null>(null);
  if (photos.length === 0) return null;

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <li key={photo.id} className="relative">
            <button
              type="button"
              onClick={() => setOpen(photo)}
              className="block h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- link temporário de bucket privado, sem otimização do Next Image. */}
              <img
                src={photo.url}
                alt={`Foto: ${title}`}
                className="h-full w-full object-cover"
              />
            </button>
            {onDelete && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(photo)}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">Apagar foto</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-w-3xl p-2 sm:p-3">
          <DialogTitle className="sr-only">Foto: {title}</DialogTitle>
          {open && (
            // eslint-disable-next-line @next/next/no-img-element -- link temporário de bucket privado.
            <img
              src={open.url}
              alt={`Foto: ${title}`}
              className="max-h-[80dvh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
