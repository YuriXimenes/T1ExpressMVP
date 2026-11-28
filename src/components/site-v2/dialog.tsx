"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { anton } from "@/components/site-v2/fonts";

/**
 * Diálogo do layout novo. Abre como folha de baixo no celular e centralizado no PC.
 * O conteúdo vai para fora da página (portal), por isso repete a classe .site-v2
 * (tokens e fonte) no próprio painel.
 */
export const V2Dialog = DialogPrimitive.Root;
export const V2DialogTrigger = DialogPrimitive.Trigger;
export const V2DialogClose = DialogPrimitive.Close;

export function V2DialogContent({
  title,
  description,
  footer,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(15,23,42,.42)] backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          "site-v2",
          anton.variable,
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl !bg-white text-t1-ink shadow-[inset_0_0_0_1px_var(--t1-line),0_-20px_60px_rgba(15,23,42,.18)] outline-none",
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-[560px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-t1-line px-[18px] pt-[18px] pb-3.5">
          <div>
            <DialogPrimitive.Title className="font-t1-display text-2xl leading-[1.08] font-normal uppercase">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-t1-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="grid size-10 shrink-0 place-items-center rounded-full text-t1-muted hover:bg-t1-hover hover:text-t1-ink"
            aria-label="Fechar"
          >
            <X className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto p-[18px]">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2.5 border-t border-t1-line bg-t1-card-3 px-[18px] pt-3.5 pb-[18px] [&>*]:flex-1 sm:[&>*]:flex-none">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
