import type { Metadata } from "next";
import { Section } from "@/components/shared/section";
import { StubPageHero } from "@/components/shared/stub-page-hero";
import { ComparisonTable } from "@/components/shared/comparison-table";
import { getCarrierComparison } from "@/lib/services/carriers.service";

export const metadata: Metadata = {
  title: "Comparativo",
};

export default async function ComparativoPage() {
  const carriers = await getCarrierComparison();

  return (
    <Section background="white">
      <StubPageHero
        title="T1 Express vs. outras transportadoras"
        description="Veja como a T1 Express se compara a Correios, Loggi e Uber Flash para o envio de TCGs."
      />

      <div className="mt-12">
        <ComparisonTable carriers={carriers} />
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Valores e prazos médios estimados para fins comparativos. Condições reais podem
        variar conforme origem, destino e volume do pedido.
      </p>
    </Section>
  );
}
