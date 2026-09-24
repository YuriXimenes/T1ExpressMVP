import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DELIVERY_STAGES } from "@/lib/order-helpers";
import { cn } from "@/lib/utils";
import type { MockOrder } from "@/lib/types/mock-order";

const STEPS = [{ label: "Aguardando pagamento" }, ...DELIVERY_STAGES];

export function OrderStatusTracker({
  order,
  onMarkCompleted,
}: {
  order: MockOrder;
  onMarkCompleted: () => void;
}) {
  const currentIndex =
    order.status === "pending-payment"
      ? 0
      : order.status === "completed"
        ? STEPS.length
        : 1 + DELIVERY_STAGES.findIndex((stage) => stage.id === order.deliveryStage);
  const isLastStage = currentIndex === STEPS.length - 1;
  const pickupDateLabel = order.estimatedPickupDate
    ? new Date(order.estimatedPickupDate).toLocaleDateString("pt-BR")
    : null;

  if (order.status === "cancelled") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="mb-1 text-xs font-medium tracking-wide text-red-700 uppercase">
          Status do pedido
        </p>
        <p className="text-sm font-medium text-red-800">Pedido cancelado</p>
        {order.cancelReason && (
          <p className="mt-1 text-sm text-red-700">{order.cancelReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
        Status do pedido
      </p>

      <ol className="space-y-3">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          const isPickupStep = step.label === "Disponível para retirada";
          return (
            <li key={step.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-brand-600 text-white"
                    : current
                      ? "border-brand-600 text-brand-600 border-2"
                      : "border border-slate-300 text-slate-300",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cn(
                  "text-sm",
                  done || current ? "font-medium text-slate-900" : "text-slate-400",
                )}
              >
                {step.label}
                {isPickupStep && pickupDateLabel && (
                  <span className="ml-1.5 font-normal text-slate-400">
                    · previsão {pickupDateLabel}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {order.status === "pending-payment" && (
        <Button size="sm" className="mt-4" asChild>
          <Link href={`/pagamento?order=${order.id}`}>Pagar agora</Link>
        </Button>
      )}

      {order.status === "active" && isLastStage && (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" className="mt-4">
              Concluir retirada
            </Button>
          }
          title="Concluir retirada?"
          description="Essa ação não pode ser desfeita. O pedido será marcado como concluído e movido para o histórico."
          confirmLabel="Concluir retirada"
          onConfirm={onMarkCompleted}
        />
      )}
    </div>
  );
}
