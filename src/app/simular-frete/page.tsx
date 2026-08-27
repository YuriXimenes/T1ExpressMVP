import type { Metadata } from "next";
import { Section } from "@/components/shared/section";
import { StubPageHero } from "@/components/shared/stub-page-hero";
import { FreightSimulatorCard } from "@/components/sections/freight-simulator-card";
import { getPartnerStores } from "@/lib/services/stores.service";

export const metadata: Metadata = {
  title: "Simular frete",
};

export default async function SimularFretePage() {
  const stores = await getPartnerStores();

  return (
    <Section background="muted">
      <StubPageHero
        title="Simule o frete da sua coleção"
        description="Escolha a loja de origem e o ponto de retirada para ver uma estimativa de preço e prazo."
      />

      <div className="mx-auto mt-10 max-w-xl">
        <FreightSimulatorCard stores={stores} />
        <p className="mt-4 text-center text-sm text-slate-500">
          Em breve: histórico de cotações, exportação em PDF e rastreamento do pedido
          diretamente por aqui.
        </p>
      </div>
    </Section>
  );
}
