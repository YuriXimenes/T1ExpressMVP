"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  PackageCheck,
  PackageSearch,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FreightStoreCard } from "@/components/shared/freight-store-card";
import { FreightStorePickerDialog } from "@/components/shared/freight-store-picker-dialog";
import { getFreightQuote } from "@/lib/services/freight.service";
import { useAuth } from "@/lib/auth";
import { savePendingOrder } from "@/lib/pending-order";
import { cn } from "@/lib/utils";
import type { FreightStore } from "@/lib/types/freight-store";
import type { FreightQuoteResult } from "@/lib/types/freight";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function FreightSimulatorCard({
  originStores,
  pickupStores,
  className,
}: {
  originStores: FreightStore[];
  pickupStores: FreightStore[];
  className?: string;
}) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  const [originIds, setOriginIds] = useState<string[]>([]);
  const [destinationId, setDestinationId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<FreightQuoteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCalculate = originIds.length > 0 && destinationId !== "";
  const selectedOrigins = originStores.filter((store) => originIds.includes(store.id));

  function removeOrigin(id: string) {
    setOriginIds((prev) => prev.filter((existing) => existing !== id));
    setResult(null);
  }

  function selectDestination(id: string) {
    setDestinationId((prev) => (prev === id ? "" : id));
    setResult(null);
  }

  async function handleCalculate() {
    if (!canCalculate) return;
    setIsLoading(true);
    setError(null);
    try {
      const quote = await getFreightQuote({
        originStoreIds: originIds,
        destinationStoreId: destinationId,
      });
      setResult(quote);
    } catch {
      setError("Não foi possível calcular o frete. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleContinue() {
    if (!result) return;
    savePendingOrder({
      originStoreIds: originIds,
      destinationStoreId: destinationId,
      quote: result,
    });
    router.push(isLoggedIn ? "/pedido" : "/login?next=%2Fpedido");
  }

  return (
    <Card className={cn("shadow-soft gap-5 p-6 sm:p-7", className)}>
      <h2 className="text-lg font-semibold text-slate-900">Simule seu frete</h2>

      <div className="space-y-3">
        <Label>Onde estão suas cartas?</Label>

        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => setPickerOpen(true)}
        >
          <Store className="h-4 w-4" aria-hidden="true" />
          {selectedOrigins.length === 0
            ? "Selecionar lojas de coleta"
            : "Editar lojas de coleta"}
        </Button>

        {selectedOrigins.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedOrigins.map((store) => (
              <span
                key={store.id}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pr-1.5 pl-2 text-xs font-medium text-slate-700"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full",
                    store.logoOnDark && "bg-slate-900",
                  )}
                >
                  <Image
                    src={store.logo}
                    alt=""
                    width={20}
                    height={20}
                    className="h-full w-full object-contain"
                  />
                </span>
                {store.name}
                <button
                  type="button"
                  onClick={() => removeOrigin(store.id)}
                  aria-label={`Remover ${store.name}`}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <FreightStorePickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          stores={originStores}
          selectedIds={originIds}
          excludedId={destinationId || undefined}
          onConfirm={(ids) => {
            setOriginIds(ids);
            setResult(null);
          }}
        />
      </div>

      <div className="space-y-3">
        <Label>Onde você quer retirar?</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pickupStores.map((store) => {
            const isOrigin = originIds.includes(store.id);
            return (
              <FreightStoreCard
                key={store.id}
                store={store}
                selected={destinationId === store.id}
                disabledLabel={isOrigin ? "Já é origem" : undefined}
                onToggle={() => selectDestination(store.id)}
              />
            );
          })}
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!canCalculate || isLoading}
        onClick={handleCalculate}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <PackageSearch className="h-4 w-4" aria-hidden="true" />
        )}
        Calcular frete
      </Button>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {result && (
        <div aria-live="polite" className="space-y-3">
          <div className="bg-brand-50 relative overflow-hidden rounded-lg px-4 py-3">
            <PackageCheck
              className="text-brand-600 pointer-events-none absolute top-1/2 right-3 h-24 w-24 -translate-y-1/2 opacity-20"
              strokeWidth={1.25}
              aria-hidden="true"
            />
            <div className="relative z-10">
              <p className="text-brand-700 text-xs font-medium uppercase">
                Nossa cotação
              </p>
              <p className="text-lg font-bold text-slate-900">
                {formatBRL(result.priceBRL)}
              </p>
              <p className="text-sm text-slate-600">
                {result.estimatedDaysMin === result.estimatedDaysMax
                  ? `${result.estimatedDaysMin} dias úteis`
                  : `${result.estimatedDaysMin}–${result.estimatedDaysMax} dias úteis`}
              </p>
              <p className="mt-1 text-xs text-slate-400">{result.distanceLabel}</p>
            </div>
          </div>

          <div className="space-y-1.5 rounded-lg border border-slate-100 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              Comparado ao mercado
            </p>
            {result.competitors.map((competitor) => (
              <div
                key={competitor.carrier}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-600">
                  {competitor.label}{" "}
                  <span className="text-xs text-slate-400">({competitor.etaLabel})</span>
                </span>
                <span className="font-semibold text-slate-800">
                  {formatBRL(competitor.totalBRL)}
                </span>
              </div>
            ))}
          </div>

          {result.cheapestSavingsBRL !== undefined && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              Você economiza {formatBRL(result.cheapestSavingsBRL)} escolhendo a T1
              Express.
            </div>
          )}

          <Button size="lg" className="w-full" onClick={handleContinue}>
            Continuar pedido
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {!isLoggedIn && (
            <p className="text-center text-xs text-slate-400">
              Você vai precisar entrar ou criar uma conta pra confirmar o pedido.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
