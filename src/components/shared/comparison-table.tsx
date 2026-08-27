import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CarrierComparisonRow } from "@/lib/types/carrier";

function BooleanCell({ value }: { value: boolean | "partial" }) {
  if (value === "partial") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700">
        <Minus className="h-4 w-4" aria-hidden="true" />
        Parcial
      </span>
    );
  }
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-emerald-700">
      <Check className="h-4 w-4" aria-hidden="true" />
      Sim
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-slate-400">
      <X className="h-4 w-4" aria-hidden="true" />
      Não
    </span>
  );
}

const rows: {
  key: keyof CarrierComparisonRow;
  label: string;
  render: (row: CarrierComparisonRow) => React.ReactNode;
}[] = [
  { key: "avgDeliveryDays", label: "Prazo médio", render: (r) => r.avgDeliveryDays },
  { key: "avgPrice", label: "Faixa de preço", render: (r) => r.avgPrice },
  {
    key: "insuranceForCollectibles",
    label: "Seguro para colecionáveis",
    render: (r) => <BooleanCell value={r.insuranceForCollectibles} />,
  },
  {
    key: "realTimeTracking",
    label: "Rastreamento em tempo real",
    render: (r) => <BooleanCell value={r.realTimeTracking} />,
  },
  {
    key: "tcgSpecialized",
    label: "Especializada em TCG",
    render: (r) => <BooleanCell value={r.tcgSpecialized} />,
  },
  {
    key: "specialPackaging",
    label: "Embalagem especial para cartas",
    render: (r) => <BooleanCell value={r.specialPackaging} />,
  },
];

export function ComparisonTable({ carriers }: { carriers: CarrierComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">
          Comparativo entre T1 Express e outras transportadoras para envio de TCG
        </caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-semibold text-slate-900"
            >
              Critério
            </th>
            {carriers.map((carrier) => (
              <th
                key={carrier.id}
                scope="col"
                className={cn(
                  "px-4 py-3 font-semibold whitespace-nowrap",
                  carrier.highlight ? "text-brand-700" : "text-slate-900",
                )}
              >
                {carrier.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100 last:border-0">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-700"
              >
                {row.label}
              </th>
              {carriers.map((carrier) => (
                <td
                  key={carrier.id}
                  className={cn(
                    "px-4 py-3 whitespace-nowrap",
                    carrier.highlight && "bg-brand-50/50",
                  )}
                >
                  {row.render(carrier)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
