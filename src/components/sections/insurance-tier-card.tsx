import { Check, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { computeInsuranceInfo } from "@/lib/insurance";
import { cn } from "@/lib/utils";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

export function InsuranceTierCard({
  itemsTotal,
  currentCoverageAmountBRL,
  currentExtraCostBRL,
  optedIn,
  onOptedInChange,
}: {
  itemsTotal: number;
  /** Cobertura já contratada — R$100 na simulação inicial, ou a cobertura atual do pedido ao adicionar loja. */
  currentCoverageAmountBRL: number;
  /** Custo já pago pela cobertura atual — 0 na simulação inicial, ou o valor já pago ao adicionar loja. */
  currentExtraCostBRL: number;
  optedIn: boolean;
  onOptedInChange: (value: boolean) => void;
}) {
  const insuranceInfo = computeInsuranceInfo(itemsTotal);
  const needsUpgrade = insuranceInfo.coverageNeededBRL > currentCoverageAmountBRL;
  const upgradeCostBRL = Math.max(0, insuranceInfo.extraCostBRL - currentExtraCostBRL);

  return (
    <Card className="gap-2 p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-brand-600 h-5 w-5" aria-hidden="true" />
        <h2 className="font-semibold text-slate-900">Seguro da entrega</h2>
      </div>

      {!needsUpgrade ? (
        <p className="text-sm text-slate-600">
          A cobertura atual (até {formatBRL(currentCoverageAmountBRL)}) já cobre o valor
          total dos itens ({formatBRL(itemsTotal)}). Nenhuma cobrança extra.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            A cobertura atual é de até {formatBRL(currentCoverageAmountBRL)}. Seus itens
            somam {formatBRL(itemsTotal)}.
          </p>
          <button
            type="button"
            aria-pressed={optedIn}
            onClick={() => onOptedInChange(!optedIn)}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-bold transition-colors",
              optedIn
                ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
                : "border-slate-200 !text-slate-600 hover:!text-slate-900",
            )}
          >
            {optedIn ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                Cobertura de {formatBRL(insuranceInfo.coverageNeededBRL)} incluída
              </>
            ) : (
              <>
                Aumentar cobertura para {formatBRL(insuranceInfo.coverageNeededBRL)} (+
                {formatBRL(upgradeCostBRL)})
              </>
            )}
          </button>
          <p className="text-xs text-slate-500">
            Você pode manter apenas a cobertura de {formatBRL(currentCoverageAmountBRL)}{" "}
            já contratada, se preferir — o seguro só assegura até o valor do tier
            contratado.
          </p>
        </div>
      )}
    </Card>
  );
}
