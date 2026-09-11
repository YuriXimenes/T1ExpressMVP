import type { PickupPartner } from "@/lib/types/pickup-partner";

/**
 * Lista completa das lojas parceiras que são pontos de coleta, usada na aba
 * "Coleta" de /pontos-t1. Os mesmos endereços/logos de
 * src/lib/data/freight-stores.ts (usado no simulador de frete), aqui
 * re-modelados com bairro e coordenadas para exibição no mapa.
 *
 * `coordinates` foram geocodificadas a partir do endereço exato de cada loja
 * via Nominatim/OpenStreetMap. Onde o número do imóvel não tinha dado exato
 * no OpenStreetMap, o ponto fica no nível da rua/quadra/CEP mais próximo do
 * endereço — aproximação razoável, não o centro exato da porta.
 */
export const coletaPartners: PickupPartner[] = [
  {
    id: "fs-01",
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
    id: "fs-02",
    name: "Bruno Pokecartas",
    neighborhood: "Vicente de Carvalho",
    city: "Rio de Janeiro",
    state: "RJ",
    address: "Avenida Vicente de Carvalho, 909 - Vicente de Carvalho - Rio de Janeiro/RJ",
    logo: "/logos/bruno-pokecartas.jpeg",
    coordinates: { lat: -22.8493217, lng: -43.3112703 },
  },
  {
    id: "fs-03",
    name: "Fagulhas Card",
    neighborhood: "Bonsucesso",
    city: "Rio de Janeiro",
    state: "RJ",
    address:
      "Rua Cardoso de Morais, 218 - Lj A Box 11 - Bonsucesso, Rio de Janeiro - RJ, 21032-000",
    logo: "/logos/fagulhas-card.jpg",
    coordinates: { lat: -22.8589976, lng: -43.2563647 },
  },
  {
    id: "fs-04",
    name: "Já Era Hora!",
    neighborhood: "Piedade",
    city: "Rio de Janeiro",
    state: "RJ",
    address: "R. Manoel Vitorino, 887 - Lj C - Piedade, Rio de Janeiro - RJ, 20740-900",
    logo: "/logos/ja-era-hora.jpg",
    coordinates: { lat: -22.894047, lng: -43.3052832 },
  },
  {
    id: "fs-05",
    name: "Magic Store Brasil",
    neighborhood: "Vila Isabel",
    city: "Rio de Janeiro",
    state: "RJ",
    address: "R. Teodoro da Silva, 240 - Vila Isabel, Rio de Janeiro - RJ, 20520-051",
    logo: "/logos/magic-store-brasil.jpeg",
    coordinates: { lat: -22.917061, lng: -43.242685 },
  },
  {
    id: "fs-06",
    name: "Bolsa do Infinito",
    neighborhood: "Tijuca",
    city: "Rio de Janeiro",
    state: "RJ",
    address:
      "Rua Conde de Bonfim, 685 - Lj D Galeria - Tijuca, Rio de Janeiro - RJ, 20520-052",
    logo: "/logos/bolsa-do-infinito.jpg",
    onDark: true,
    coordinates: { lat: -22.9322191, lng: -43.2403431 },
  },
  {
    id: "fs-07",
    name: "Beco Horizontal Card Games",
    neighborhood: "Tijuca",
    city: "Rio de Janeiro",
    state: "RJ",
    address:
      "Rua Engenheiro Ernani Cotrin, 15 - Lj G - Tijuca, Rio de Janeiro - RJ, 20510-260",
    logo: "/logos/beco-horizontal.jpg",
    coordinates: { lat: -22.9292571, lng: -43.2437567 },
  },
  {
    id: "fs-08",
    name: "Red",
    neighborhood: "Centro",
    city: "Rio de Janeiro",
    state: "RJ",
    address: "Av. Treze de Maio, 23 - sala 533 - Centro, Rio de Janeiro - RJ, 20031-902",
    logo: "/logos/red.jpg",
    coordinates: { lat: -22.9092961, lng: -43.177331 },
  },
  {
    id: "fs-09",
    name: "Collect & Play",
    neighborhood: "Barra da Tijuca",
    city: "Rio de Janeiro",
    state: "RJ",
    address:
      "Av. das Américas, 5001 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22631-004",
    logo: "/logos/collect-play.jpg",
    coordinates: { lat: -23.0007369, lng: -43.3623951 },
  },
  {
    id: "fs-10",
    name: "Kamusari Store",
    neighborhood: "Barra da Tijuca",
    city: "Rio de Janeiro",
    state: "RJ",
    address:
      "Av. das Américas, 5.777 - Lj 116 - Barra da Tijuca, Rio de Janeiro - RJ, 22793-080",
    logo: "/logos/kamusari-store.jpg",
    coordinates: { lat: -22.9990766, lng: -43.3666914 },
  },
  {
    id: "fs-11",
    name: "Konklave",
    neighborhood: "Centro",
    city: "Nova Iguaçu",
    state: "RJ",
    address:
      "Iguaçu Center - Av. Mal. Floriano Peixoto, 1480 - Lj 241 - Centro, Nova Iguaçu - RJ, 26220-06",
    logo: "/logos/konklave.jpg",
    coordinates: { lat: -22.758498, lng: -43.4546255 },
  },
];
