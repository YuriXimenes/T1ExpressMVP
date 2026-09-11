import type { FreightStore } from "@/lib/types/freight-store";

/**
 * Lojas reais usadas no simulador de frete. Independente de
 * src/lib/data/stores.ts (fictício, usado em /pontos-t1) e de
 * src/lib/data/pickup-partners.ts (exclusivo da seção "T1 Network" da home),
 * ainda que os endereços das 4 lojas com isPickupPoint coincidam com os de lá.
 * Logos reaproveitados de src/lib/data/store-logos.ts (mesmos arquivos).
 */
export const freightStores: FreightStore[] = [
  {
    id: "fs-01",
    name: "Cards of Paradise",
    address: "Av. Meriti, 908 - Vila da Penha, Rio de Janeiro - RJ, 21211-006",
    logo: "/logos/cards-of-paradise.png",
    logoOnDark: true,
    isPickupPoint: true,
  },
  {
    id: "fs-02",
    name: "Bruno Pokecartas",
    address: "Avenida Vicente de Carvalho, 909 - Vicente de Carvalho - Rio de Janeiro/RJ",
    logo: "/logos/bruno-pokecartas.jpeg",
    isPickupPoint: false,
  },
  {
    id: "fs-03",
    name: "Fagulhas Card",
    address:
      "Rua Cardoso de Morais, 218 - Lj A Box 11 - Bonsucesso, Rio de Janeiro - RJ, 21032-000",
    logo: "/logos/fagulhas-card.jpg",
    isPickupPoint: false,
  },
  {
    id: "fs-04",
    name: "Já Era Hora!",
    address: "R. Manoel Vitorino, 887 - Lj C - Piedade, Rio de Janeiro - RJ, 20740-900",
    logo: "/logos/ja-era-hora.jpg",
    isPickupPoint: false,
  },
  {
    id: "fs-05",
    name: "Magic Store Brasil",
    address: "R. Teodoro da Silva, 240 - Vila Isabel, Rio de Janeiro - RJ, 20520-051",
    logo: "/logos/magic-store-brasil.jpeg",
    isPickupPoint: true,
  },
  {
    id: "fs-06",
    name: "Bolsa do Infinito",
    address:
      "Rua Conde de Bonfim, 685 - Lj D Galeria - Tijuca, Rio de Janeiro - RJ, 20520-052",
    logo: "/logos/bolsa-do-infinito.jpg",
    logoOnDark: true,
    isPickupPoint: false,
  },
  {
    id: "fs-07",
    name: "Beco Horizontal Card Games",
    address:
      "Rua Engenheiro Ernani Cotrin, 15 - Lj G - Tijuca, Rio de Janeiro - RJ, 20510-260",
    logo: "/logos/beco-horizontal.jpg",
    isPickupPoint: false,
  },
  {
    id: "fs-08",
    name: "Red",
    address: "Av. Treze de Maio, 23 - sala 533 - Centro, Rio de Janeiro - RJ, 20031-902",
    logo: "/logos/red.jpg",
    isPickupPoint: false,
  },
  {
    id: "fs-09",
    name: "Collect & Play",
    address:
      "Av. das Américas, 5001 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22631-004",
    logo: "/logos/collect-play.jpg",
    isPickupPoint: true,
  },
  {
    id: "fs-10",
    name: "Kamusari Store",
    address:
      "Av. das Américas, 5.777 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22793-080",
    logo: "/logos/kamusari-store.jpg",
    isPickupPoint: false,
  },
  {
    id: "fs-11",
    name: "Konklave",
    address:
      "Iguaçu Center - Av. Mal. Floriano Peixoto, 1480 - Lj 241 - Centro, Nova Iguaçu - RJ, 26220-06",
    logo: "/logos/konklave.jpg",
    isPickupPoint: true,
  },
];
