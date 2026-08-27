"use client";

import { useState } from "react";
import { ArrowRight, Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFreightQuote } from "@/lib/services/freight.service";
import type { PartnerStore } from "@/lib/types/store";
import type { FreightQuoteResult } from "@/lib/types/freight";

export function FreightSimulatorCard({
  stores,
  className,
}: {
  stores: PartnerStore[];
  className?: string;
}) {
  const [originId, setOriginId] = useState<string>("");
  const [destinationId, setDestinationId] = useState<string>("");
  const [result, setResult] = useState<FreightQuoteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCalculate =
    originId !== "" && destinationId !== "" && originId !== destinationId;

  async function handleCalculate() {
    if (!canCalculate) return;
    setIsLoading(true);
    setError(null);
    try {
      const quote = await getFreightQuote({
        originStoreId: originId,
        destinationStoreId: destinationId,
      });
      setResult(quote);
    } catch {
      setError("Não foi possível calcular o frete. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className={`shadow-soft gap-5 p-6 sm:p-7 ${className ?? ""}`}>
      <h2 className="text-lg font-semibold text-slate-900">Simule seu frete</h2>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="origin-store">Onde estão suas cartas?</Label>
          <Select
            value={originId}
            onValueChange={(value) => {
              setOriginId(value);
              setResult(null);
            }}
          >
            <SelectTrigger id="origin-store" className="w-full">
              <SelectValue placeholder="Selecione a loja de origem" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name} — {store.city}/{store.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-1.5">
          <Label htmlFor="destination-store">Onde você quer retirar?</Label>
          <Select
            value={destinationId}
            onValueChange={(value) => {
              setDestinationId(value);
              setResult(null);
            }}
          >
            <SelectTrigger id="destination-store" className="w-full">
              <SelectValue placeholder="Selecione o ponto de retirada" />
            </SelectTrigger>
            <SelectContent>
              {stores
                .filter((store) => store.isPickupPoint)
                .map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name} — {store.city}/{store.state}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
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
        <div
          aria-live="polite"
          className="bg-brand-50 flex items-center justify-between rounded-lg px-4 py-3"
        >
          <div>
            <p className="text-brand-700 text-xs font-medium uppercase">Estimativa</p>
            <p className="text-lg font-bold text-slate-900">
              R$ {result.priceBRL.toFixed(2).replace(".", ",")}
            </p>
            <p className="text-sm text-slate-600">
              {result.estimatedDaysMin === result.estimatedDaysMax
                ? `${result.estimatedDaysMin} dia útil`
                : `${result.estimatedDaysMin}–${result.estimatedDaysMax} dias úteis`}
            </p>
          </div>
          <ArrowRight className="text-brand-600 h-5 w-5" aria-hidden="true" />
        </div>
      )}
    </Card>
  );
}
