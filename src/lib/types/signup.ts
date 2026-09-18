export type GameTag = "magic" | "pokemon" | "yugioh" | "lorcana" | "fab" | "outro";

export interface CustomPreferredStore {
  name: string;
  address: string;
}

export interface SignupAddress {
  street: string;
  /** Número do imóvel (texto livre, aceita "s/n"). Ausente em contas antigas. */
  number?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  complement?: string;
}
