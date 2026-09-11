import { pickupPartners } from "@/lib/data/pickup-partners";
import { coletaPartners } from "@/lib/data/coleta-partners";
import type { PickupPartner } from "@/lib/types/pickup-partner";

export async function getPickupPartners(): Promise<PickupPartner[]> {
  return pickupPartners;
}

export async function getColetaPartners(): Promise<PickupPartner[]> {
  return coletaPartners;
}
