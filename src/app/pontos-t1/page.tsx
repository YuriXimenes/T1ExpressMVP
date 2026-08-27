import type { Metadata } from "next";
import { Section } from "@/components/shared/section";
import { StubPageHero } from "@/components/shared/stub-page-hero";
import { StoreCard } from "@/components/shared/store-card";
import { getPartnerStores } from "@/lib/services/stores.service";

export const metadata: Metadata = {
  title: "Pontos T1",
};

export default async function PontosT1Page() {
  const stores = await getPartnerStores();

  return (
    <Section background="white">
      <StubPageHero
        title="Pontos T1"
        description={
          'Todas as lojas parceiras da rede T1 Express. Lojas com o selo "Ponto de retirada" também recebem pedidos para retirada final.'
        }
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>
    </Section>
  );
}
