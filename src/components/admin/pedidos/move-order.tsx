"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminError, moveOrder } from "@/lib/admin/api";
import {
  MOVE_TARGET_LABELS,
  allowedTargets,
  moveRule,
  orderCode,
  type MovableOrder,
  type OrderMoveTarget,
} from "@/lib/admin/order-moves";
import { cn } from "@/lib/utils";
import { useCan } from "@/lib/admin/access-provider";

export interface MoveOrderTarget extends MovableOrder {
  id: string;
}

interface PendingMove {
  order: MoveOrderTarget;
  target: OrderMoveTarget;
}

export interface OrderMover {
  /** Avanço normal acontece na hora; o resto abre a janela de motivo. */
  request: (order: MoveOrderTarget, target: OrderMoveTarget) => void;
  /** Pedido sendo movido agora (trava o cartão/botão). */
  busyId: string | null;
  /** Erro fora da janela (avanço direto ou movimento proibido). */
  error: string | null;
  clearError: () => void;
  dialog: React.ReactNode;
}

const errorMessage = (err: unknown) =>
  err instanceof AdminError ? err.message : "Não foi possível mover o pedido.";

export function useOrderMover(onMoved: () => void | Promise<void>): OrderMover {
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function run(orderId: string, target: OrderMoveTarget, text?: string) {
    setBusyId(orderId);
    try {
      await moveOrder(orderId, target, text);
      await onMoved();
      return null;
    } catch (err) {
      return errorMessage(err);
    } finally {
      setBusyId(null);
    }
  }

  function request(order: MoveOrderTarget, target: OrderMoveTarget) {
    if (busyId) return;
    setError(null);
    const rule = moveRule(order, target);
    if (!rule.allowed) {
      setError(rule.why);
      return;
    }
    if (!rule.needsReason) {
      void run(order.id, target).then(setError);
      return;
    }
    setReason("");
    setDialogError(null);
    setPending({ order, target });
  }

  async function confirm() {
    if (!pending) return;
    const failure = await run(pending.order.id, pending.target, reason);
    if (failure) setDialogError(failure);
    else setPending(null);
  }

  const dialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open && !busyId) setPending(null);
      }}
    >
      {pending && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mover #{orderCode(pending.order.id)} para &ldquo;
              {MOVE_TARGET_LABELS[pending.target]}&rdquo;?
            </DialogTitle>
            <DialogDescription>{moveExplanation(pending)}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-reason">Motivo (obrigatório)</Label>
            <Textarea
              id="move-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fica registrado na linha do tempo do pedido."
            />
          </div>
          {dialogError && (
            <p role="alert" className="text-sm text-red-600">
              {dialogError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!!busyId}
              onClick={() => setPending(null)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant={pending.target === "cancelled" ? "destructive" : "default"}
              disabled={!reason.trim() || !!busyId}
              onClick={() => void confirm()}
            >
              {busyId ? "Movendo..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );

  return { request, busyId, error, clearError: () => setError(null), dialog };
}

function moveExplanation({ order, target }: PendingMove): string {
  if (target === "cancelled") {
    return "O pedido sai da operação e aparece como cancelado para o cliente. Não dá para desfazer.";
  }
  if (target === "completed") {
    return "O pedido ainda não chegou à retirada. Conte o que aconteceu para concluir antes.";
  }
  return order.status === "active"
    ? "Voltar ou pular etapa é uma exceção: o motivo fica na linha do tempo do pedido."
    : "";
}

const ITEM =
  "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900";

/** "Mover para…": a mesma regra do arrastar, para celular, teclado e detalhe do pedido. */
export function MoveOrderMenu({
  order,
  mover,
  size = "sm",
  className,
}: {
  order: MoveOrderTarget;
  mover: OrderMover;
  size?: "sm" | "icon";
  className?: string;
}) {
  const canEdit = useCan("pedidos", "edit");
  const targets = allowedTargets(order);
  if (!canEdit || targets.length === 0) return null;
  const busy = mover.busyId === order.id;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size === "icon" ? "icon-sm" : "sm"}
          disabled={!!mover.busyId}
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
          {size === "icon" ? (
            <span className="sr-only">Mover pedido #{orderCode(order.id)}</span>
          ) : busy ? (
            "Movendo..."
          ) : (
            "Mover para…"
          )}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs text-slate-500">
            Mover para
          </DropdownMenu.Label>
          {targets.map(({ target, needsReason }) => (
            <DropdownMenu.Item
              key={target}
              className={cn(ITEM, target === "cancelled" && "text-red-600")}
              onSelect={() => mover.request(order, target)}
            >
              {MOVE_TARGET_LABELS[target]}
              {needsReason && <span className="text-xs text-slate-400">pede motivo</span>}
            </DropdownMenu.Item>
          ))}
          {order.status === "active" && (
            <p className="border-t border-slate-100 px-2.5 pt-2 pb-1 text-xs text-slate-400">
              Não volta para &ldquo;Aguardando pagamento&rdquo;: o pagamento é feito só
              pelo cliente.
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
