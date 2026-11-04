"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/lib/catalog/provider";
import {
  AdminError,
  fetchAdminOrder,
  fetchOrderHandling,
  type AdminOrder,
  type OrderHandling,
} from "@/lib/admin/api";
import {
  DEFAULT_LABEL_SIZE,
  LABEL_SIZES,
  pickupUrl,
  type LabelSize,
} from "@/lib/admin/handling";
import { orderCode } from "@/lib/admin/order-moves";
import { cn } from "@/lib/utils";

/** Etiqueta do pacote para impressora térmica. O menu do backoffice some na impressão. */
export function LabelPrint({ orderId }: { orderId: string }) {
  const { stores } = useCatalog();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [handling, setHandling] = useState<OrderHandling | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [size, setSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminOrder(orderId), fetchOrderHandling(orderId)])
      .then(async ([data, info]) => {
        if (cancelled) return;
        if (!data) throw new AdminError("Pedido não encontrado.");
        if (!info.pickup)
          throw new AdminError("O pedido ainda não foi pago: sem etiqueta.");
        const svg = await QRCode.toString(
          pickupUrl(window.location.origin, info.pickup.packageToken),
          {
            type: "svg",
            margin: 0,
            errorCorrectionLevel: "M",
          },
        );
        if (cancelled) return;
        setOrder(data);
        setHandling(info);
        setQrSvg(svg);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof AdminError
              ? err.message
              : "Não foi possível montar a etiqueta.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!order || !handling || !qrSvg)
    return <p className="text-sm text-slate-500">Carregando...</p>;

  const dims = LABEL_SIZES[size];
  const small = size === "60x40";
  const destination = stores.find((s) => s.id === order.destinationStoreId);
  const storeName = (code: string) => stores.find((s) => s.id === code)?.name ?? code;

  return (
    <div className="flex flex-col gap-4">
      {/* Tamanho do papel da impressora: o @page acompanha a escolha. */}
      <style>{`@page { size: ${dims.widthMm}mm ${dims.heightMm}mm; margin: 0; }`}</style>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-xl font-semibold text-slate-900">
          Etiqueta do pedido #{orderCode(order.id)}
        </h1>
        <div className="flex gap-1.5" role="group" aria-label="Tamanho da etiqueta">
          {(Object.keys(LABEL_SIZES) as LabelSize[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={size === id}
              onClick={() => setSize(id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                size === id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {LABEL_SIZES[id].label}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimir
        </Button>
      </div>
      <p className="text-xs text-slate-500 print:hidden">
        Na janela de impressão, escolha a impressora térmica e o papel do mesmo tamanho,
        com margens &ldquo;Nenhuma&rdquo; e escala 100%.
      </p>

      <div
        className="label-sheet overflow-hidden border border-dashed border-slate-300 bg-white text-black print:border-0"
        style={{ width: `${dims.widthMm}mm`, height: `${dims.heightMm}mm` }}
      >
        {small ? (
          <div className="flex h-full items-center gap-[2mm] p-[2mm]">
            <div
              className="aspect-square h-full shrink-0 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="min-w-0 text-[7pt] leading-tight">
              <p className="text-[11pt] font-bold">#{orderCode(order.id)}</p>
              <p className="mt-[1mm] font-semibold">Retirada:</p>
              <p>{destination?.name ?? order.destinationStoreId}</p>
              <p className="mt-[1mm]">{order.customerName}</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col p-[5mm] text-[9pt] leading-snug">
            <div className="flex items-baseline justify-between border-b-2 border-black pb-[2mm]">
              <p className="text-[14pt] font-bold">T1 Express</p>
              <p className="text-[16pt] font-bold">#{orderCode(order.id)}</p>
            </div>
            <div
              className="mx-auto my-[4mm] w-[55mm] [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-center text-[7pt]">
              Loja: aponte a câmera para o QR e digite o código do cliente.
            </p>
            <div className="mt-[3mm] border-t border-black pt-[2mm]">
              <p className="text-[7pt] font-semibold uppercase">Retirada</p>
              <p className="text-[11pt] font-bold">
                {destination?.name ?? order.destinationStoreId}
              </p>
              {destination?.address && (
                <p className="text-[8pt]">{destination.address}</p>
              )}
            </div>
            <div className="mt-[2mm]">
              <p className="text-[7pt] font-semibold uppercase">Cliente</p>
              <p className="text-[10pt]">{order.customerName}</p>
            </div>
            <div className="mt-[2mm]">
              <p className="text-[7pt] font-semibold uppercase">Coleta</p>
              <p className="text-[8pt]">
                {order.originStoreIds.map(storeName).join(", ")}
              </p>
            </div>
            <p className="mt-auto text-[7pt]">
              Pedido em {new Date(order.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
