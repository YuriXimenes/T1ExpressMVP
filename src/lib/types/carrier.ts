export interface CarrierComparisonRow {
  id: string;
  name: string;
  avgDeliveryDays: string;
  avgPrice: string;
  insuranceForCollectibles: boolean | "partial";
  realTimeTracking: boolean;
  tcgSpecialized: boolean;
  specialPackaging: boolean;
  highlight?: boolean;
}
