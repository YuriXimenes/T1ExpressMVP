export type ComparisonStatus = "positive" | "negative" | "neutral";

export interface ComparisonCarrier {
  id: string;
  name: string;
  highlight?: boolean;
}

export interface ComparisonValue {
  /** Omitido em linhas informativas que não usam indicador colorido (ex: prazo médio). */
  status?: ComparisonStatus;
  text: string;
  /** Linha secundária opcional, menor e mais discreta (ex: valor médio). */
  detail?: string;
}

export interface ComparisonRow {
  label: string;
  /** Mesma ordem de `marketComparisonCarriers`. */
  values: ComparisonValue[];
}
