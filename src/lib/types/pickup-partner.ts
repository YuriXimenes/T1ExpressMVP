export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface PickupPartner {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
  address: string;
  logo: string;
  /** Logos com arte clara/transparente precisam de um fundo escuro para ficarem visíveis. */
  onDark?: boolean;
  /** Coordenadas geocodificadas a partir do endereço exato da loja (OpenStreetMap/Nominatim). */
  coordinates: GeoCoordinates;
}
