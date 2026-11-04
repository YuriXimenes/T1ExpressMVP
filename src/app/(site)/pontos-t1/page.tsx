import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { StubPageHero } from "@/components/shared/stub-page-hero";
import { PontosT1Network } from "@/components/sections/pontos-t1-network";
import {
  getColetaPartners,
  getPickupPartners,
} from "@/lib/services/pickup-partners.service";

export const metadata: Metadata = {
  title: "Pontos T1",
};

export default async function PontosT1Page() {
  const [coletaPartners, retiradaPartners] = await Promise.all([
    getColetaPartners(),
    getPickupPartners(),
  ]);

  return (
    <section className="relative overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <StubPageHero
          title="Pontos T1"
          description={
            <>
              Veja no mapa onde coletamos e onde entregamos sua coleção.
              <br />
              Clique em uma loja na lista para localizá-la.
            </>
          }
        />

        <PontosT1Network
          coletaPartners={coletaPartners}
          retiradaPartners={retiradaPartners}
        />
      </Container>
    </section>
  );
}
