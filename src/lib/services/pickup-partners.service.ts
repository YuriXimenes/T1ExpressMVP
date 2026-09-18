import { getCatalog } from "@/lib/catalog/server";
import type { PickupPartner } from "@/lib/types/pickup-partner";

export async function getPickupPartners(): Promise<PickupPartner[]> {
  return (await getCatalog()).pickupPartners;
}

export async function getColetaPartners(): Promise<PickupPartner[]> {
  return (await getCatalog()).coletaPartners;
}
