export interface FreightStore {
  id: string;
  name: string;
  address: string;
  logo: string;
  /** Logos com arte clara/transparente precisam de um fundo escuro para ficarem visíveis. */
  logoOnDark?: boolean;
  /** Loja também aceita ser ponto final de retirada. */
  isPickupPoint: boolean;
}
