export type FranchiseTag =
  "magic" | "yugioh" | "pokemon" | "onepiece" | "digimon" | "outros";

export interface PartnerStore {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  franchises: FranchiseTag[];
  description: string;
  /** Loja aceita ser retirada final de pedidos, além de ponto de coleta. */
  isPickupPoint: boolean;
  address?: string;
  rating?: number;
}
