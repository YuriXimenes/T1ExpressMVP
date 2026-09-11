export type GameTag = "magic" | "pokemon" | "yugioh" | "lorcana" | "fab" | "outro";

export interface CustomPreferredStore {
  name: string;
  address: string;
}

export interface SignupAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  complement?: string;
}
