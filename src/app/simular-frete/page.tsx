import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { StubPageHero } from "@/components/shared/stub-page-hero";
import { FreightSimulatorCard } from "@/components/sections/freight-simulator-card";
import {
  getFreightPickupPoints,
  getFreightStores,
} from "@/lib/services/freight-stores.service";

export const metadata: Metadata = {
  title: "Simular frete",
};

export default async function SimularFretePage() {
  const [originStores, pickupStores] = await Promise.all([
    getFreightStores(),
    getFreightPickupPoints(),
  ]);

  return (
    <section className="relative overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <StubPageHero
          title="Simule o frete da sua coleção"
          description="Escolha a loja de origem e o ponto de retirada para ver uma estimativa de preço e prazo."
        />

        <div className="mx-auto mt-10 max-w-xl">
          <FreightSimulatorCard originStores={originStores} pickupStores={pickupStores} />
          <p className="mt-4 text-center text-sm text-slate-500">
            Em breve: histórico de cotações, exportação em PDF e rastreamento do pedido
            diretamente por aqui.
          </p>
        </div>
      </Container>
    </section>
  );
}
