import { getCatalog } from "@/lib/catalog/server";
import type { FreightStore } from "@/lib/types/freight-store";

export async function getFreightStores(): Promise<FreightStore[]> {
  return (await getCatalog()).stores;
}

export async function getFreightPickupPoints(): Promise<FreightStore[]> {
  return (await getCatalog()).stores.filter((store) => store.isPickupPoint);
}
