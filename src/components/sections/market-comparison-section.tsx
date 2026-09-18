import { Container } from "@/components/shared/container";
import { cn } from "@/lib/utils";
import { getCatalog } from "@/lib/catalog/server";
import type { ComparisonStatus } from "@/lib/types/market-comparison";

const dotStyles: Record<ComparisonStatus, string> = {
  positive: "bg-emerald-400",
  negative: "bg-red-500",
  neutral: "bg-amber-400",
};

function StatusDot({ status }: { status: ComparisonStatus }) {
  return (
    <span
      className={cn("h-2 w-2 shrink-0 rounded-full", dotStyles[status])}
      aria-hidden="true"
    />
  );
}

function DetailText({ text }: { text: string }) {
  const parts = text.split("por loja");
  if (parts.length !== 2) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <strong className="font-semibold text-slate-300">por loja</strong>
      {parts[1]}
    </>
  );
}

export async function MarketComparisonSection() {
  const { marketComparison } = await getCatalog();
  const marketComparisonCarriers = marketComparison.carriers;
  const marketComparisonRows = marketComparison.rows;
  const columns = marketComparisonCarriers.length;

  return (
    <section className="from-brand-950 via-brand-900 relative overflow-hidden bg-gradient-to-b to-slate-950 py-14 md:py-20">
      <div
        aria-hidden="true"
        className="bg-brand-600/30 pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl"
      />

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-brand-400 text-sm font-semibold tracking-wide uppercase">
            Comparativo
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            T1 Express vs. o resto do mercado
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Transportadoras genéricas não foram feitas para cuidar de coleções raras.{" "}
            A&nbsp;T1 cuida de tudo, do primeiro clique até a retirada na loja.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto pt-6 pb-2">
          <div
            className="grid min-w-[720px] gap-x-3"
            style={{ gridTemplateColumns: `1.4fr repeat(${columns}, 1fr)` }}
          >
            <div />
            {marketComparisonCarriers.map((carrier) => (
              <div
                key={carrier.id}
                className={cn(
                  "relative rounded-t-2xl px-4 pt-8 pb-4 text-center",
                  carrier.highlight
                    ? "from-brand-600 to-brand-700 bg-gradient-to-b shadow-xl shadow-black/40"
                    : "bg-white/5",
                )}
              >
                {carrier.highlight && (
                  <span className="text-brand-700 absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] font-bold whitespace-nowrap">
                    MELHOR ESCOLHA
                  </span>
                )}
                <p
                  className={cn(
                    "font-bold",
                    carrier.highlight
                      ? "text-base text-white sm:text-lg"
                      : "text-sm text-slate-200 sm:text-base",
                  )}
                >
                  {carrier.name}
                </p>
              </div>
            ))}

            {marketComparisonRows.map((row, rowIndex) => {
              const isLastRow = rowIndex === marketComparisonRows.length - 1;
              return (
                <div key={row.label} className="contents">
                  <div className="flex items-center border-t border-white/10 px-4 py-4 text-sm text-slate-300">
                    {row.label}
                  </div>
                  {row.values.map((value, colIndex) => {
                    const carrier = marketComparisonCarriers[colIndex];
                    return (
                      <div
                        key={carrier.id}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 border-t border-white/10 px-3 py-4 text-center",
                          carrier.highlight && "bg-brand-600/10",
                          carrier.highlight && isLastRow && "rounded-b-2xl",
                        )}
                      >
                        {value.status && <StatusDot status={value.status} />}
                        <span className="text-xs text-slate-200 sm:text-sm">
                          {value.text}
                        </span>
                        {value.detail && (
                          <span className="text-[11px] text-slate-400">
                            <DetailText text={value.detail} />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
