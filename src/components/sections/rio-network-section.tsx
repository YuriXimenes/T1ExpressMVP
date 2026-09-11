import { Section } from "@/components/shared/section";
import { SectionHeading } from "@/components/shared/section-heading";
import { NetworkMapList } from "@/components/shared/network-map-list";
import type { PickupPartner } from "@/lib/types/pickup-partner";

export function RioNetworkSection({ partners }: { partners: PickupPartner[] }) {
  return (
    <Section background="white">
      <SectionHeading
        kicker="T1 Network"
        title="A maior rede de lojas TCG do Brasil"
        description="Pontos de retirada parceiros espalhados pelo Rio de Janeiro. Clique em uma loja para localizá-la no mapa."
      />

      <div className="mt-12">
        <NetworkMapList partners={partners} />
      </div>
    </Section>
  );
}
