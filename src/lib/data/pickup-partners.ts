import type { PickupPartner } from "@/lib/types/pickup-partner";

/**
 * Pontos de retirada reais no Rio de Janeiro — usada na seção "T1 Network" da
 * home e na aba "Retirada" de /pontos-t1. Não confundir com
 * src/lib/data/stores.ts (dado fictício, usado só na seção de destaque da
 * home) nem com src/lib/data/coleta-partners.ts (lista completa de pontos de
 * coleta, aba "Coleta" de /pontos-t1).
 *
 * `coordinates` foram geocodificadas a partir do endereço exato de cada loja
 * via Nominatim/OpenStreetMap. Onde o número do imóvel não tinha dado exato
 * no OpenStreetMap (Konklave, Magic Store Brasil), o ponto fica no nível da
 * rua/quadra mais próxima do endereço — aproximação razoável, não o centro
 * exato da porta.
 */
export const pickupPartners: PickupPartner[] = [
  {
    id: "pp-01",
    name: "Cards of Paradise",
    neighborhood: "Vila da Penha",
    city: "Rio de Janeiro",
    state: "RJ",
    address: "Av. Meriti, 908 - Vila da Penha, Rio de Janeiro - RJ, 21211-006",
    logo: "/logos/cards-of-paradise.png",
    onDark: true,
    coordinates: { lat: -22.8497073, lng: -43.309694 },
  },
  {
    id: "pp-02",
    name: "Konklave",
    neighborhood: "Centro",
    city: "Nova Iguaçu",
    state: "RJ",
    address:
      "Iguaçu Center - Av. Mal. Floriano Peixoto, 1480 - Lj 241 - Centro, Nova Iguaçu - RJ, 26220-06",
    logo: "/logos/konklave.jpg",
    coordinates: { lat: -22.758498, lng: -43.4546255 },
  },
  {
    id: "pp-03",
    name: "Magic Store Brasil",
    neighborhood: "Vila Isabel",
    city: "Rio de Janeiro",
    state: "RJ",
    address: "R. Teodoro da Silva, 240 - Vila Isabel, Rio de Janeiro - RJ, 20520-051",
    logo: "/logos/magic-store-brasil.jpeg",
    coordinates: { lat: -22.917061, lng: -43.242685 },
  },
  {
    id: "pp-04",
    name: "Collect & Play",
    neighborhood: "Barra da Tijuca",
    city: "Rio de Janeiro",
    state: "RJ",
    address:
      "Av. das Américas, 5001 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22631-004",
    logo: "/logos/collect-play.jpg",
    coordinates: { lat: -23.0007369, lng: -43.3623951 },
  },
];
