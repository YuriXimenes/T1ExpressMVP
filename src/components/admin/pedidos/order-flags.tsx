import { ClipboardCheck } from "lucide-react";
import type { AdminOrderSummary } from "@/lib/admin/api";
import { cn } from "@/lib/utils";

/**
 * Alertas do pedido: conferência (verde = tudo certo, âmbar = divergência),
 * loja extra a pagar (ponto âmbar) e chamado em aberto (ponto vermelho).
 */
export function OrderFlags({
  order,
}: {
  order: Pick<AdminOrderSummary, "hasPendingCharge" | "hasOpenTicket" | "checkStatus">;
}) {
  const checkTitle =
    order.checkStatus === "divergent"
      ? "Conferência com divergência"
      : order.checkStatus === "ok"
        ? "Conferido, tudo conforme"
        : null;
  return (
    <>
      {checkTitle && (
        <span title={checkTitle} className="inline-flex shrink-0">
          <ClipboardCheck
            className={cn(
              "h-3.5 w-3.5",
              order.checkStatus === "divergent" ? "text-amber-600" : "text-emerald-600",
            )}
            aria-hidden="true"
          />
          <span className="sr-only">{checkTitle}</span>
        </span>
      )}
      {order.hasPendingCharge && (
        <span
          title="Cobrança de loja extra pendente"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
        >
          <span className="sr-only">Cobrança de loja extra pendente</span>
        </span>
      )}
      {order.hasOpenTicket && (
        <span
          title="Chamado em aberto"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
        >
          <span className="sr-only">Chamado em aberto</span>
        </span>
      )}
    </>
  );
}
