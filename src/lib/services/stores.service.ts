import { stores } from "@/lib/data/stores";
import type { PartnerStore } from "@/lib/types/store";

export async function getPartnerStores(): Promise<PartnerStore[]> {
  return stores;
}

export async function getPickupPoints(): Promise<PartnerStore[]> {
  return stores.filter((store) => store.isPickupPoint);
}

export async function getFeaturedStores(limit = 3): Promise<PartnerStore[]> {
  return stores.slice(0, limit);
}
