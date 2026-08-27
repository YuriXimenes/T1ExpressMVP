import { carrierComparison } from "@/lib/data/carriers-comparison";
import type { CarrierComparisonRow } from "@/lib/types/carrier";

export async function getCarrierComparison(): Promise<CarrierComparisonRow[]> {
  return carrierComparison;
}
