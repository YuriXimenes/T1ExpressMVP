import type { AccessoryKind, PedidoKind } from "@/lib/types/order";

export const pedidoKindOptions: { id: PedidoKind; label: string }[] = [
  { id: "cartas-avulsas", label: "Cartas avulsas" },
  { id: "boosters", label: "Boosters" },
  { id: "deck-box", label: "Deck Box" },
  { id: "acessorios", label: "Acessórios" },
];

export const accessoryOptions: { id: AccessoryKind; label: string }[] = [
  { id: "sleeve", label: "Sleeve" },
  { id: "perfect-fit", label: "Perfect Fit" },
  { id: "playmat", label: "Playmat" },
  { id: "fichario", label: "Fichário" },
  { id: "case", label: "Case" },
  { id: "outro", label: "Outros" },
];
