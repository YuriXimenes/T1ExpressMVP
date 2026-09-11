import { freightStores } from "@/lib/data/freight-stores";
import type { FreightStore } from "@/lib/types/freight-store";

// TODO: quando o backend existir, trocar por uma chamada real que também
// persista o endereço selecionado pelo usuário na cotação.
export async function getFreightStores(): Promise<FreightStore[]> {
  return freightStores;
}

export async function getFreightPickupPoints(): Promise<FreightStore[]> {
  return freightStores.filter((store) => store.isPickupPoint);
}
