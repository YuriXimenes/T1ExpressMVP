import { lookupCep, type CepInfo } from "@/lib/cep-lookup";

/**
 * Regiões do RJ da pesquisa. O CEP (via ViaCEP) dá cidade e bairro; daqui sai a
 * região. As listas são a "verdade" e podem ser ajustadas à vontade: um bairro
 * que não estiver em nenhuma cai na escolha manual, nunca em um palpite.
 */
export const REGION_OTHER = "Outra região";

export const REGIONS = [
  "Grande Tijuca",
  "Zona Norte",
  "Centro",
  "Zona Sul",
  "Zona Oeste",
  "Baixada Fluminense",
  "Niterói ou São Gonçalo",
  "Maricá ou Região dos Lagos",
  REGION_OTHER,
] as const;

export type Region = (typeof REGIONS)[number];

/** Minúsculas, sem acento nem pontuação, espaços únicos — para comparar nomes. */
export function normalizeName(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const list = (names: string) => names.split("|").map((n) => normalizeName(n));

/** Bairros da cidade do Rio de Janeiro por região. */
type RioRegion = "Grande Tijuca" | "Centro" | "Zona Sul" | "Zona Oeste" | "Zona Norte";

/** Exportado só para o teste que garante que nenhum bairro está em duas regiões. */
export const RIO_NEIGHBORHOODS: Record<RioRegion, string[]> = {
  "Grande Tijuca": list(
    "Tijuca|Vila Isabel|Maracanã|Andaraí|Grajaú|Praça da Bandeira|Alto da Boa Vista|Usina|Salgueiro",
  ),
  Centro: list(
    "Centro|Lapa|Santa Teresa|Estácio|Cidade Nova|Rio Comprido|Catumbi|Saúde|Gamboa|Santo Cristo|Paquetá|Bairro de Fátima|Fátima",
  ),
  "Zona Sul": list(
    "Copacabana|Ipanema|Leblon|Leme|Botafogo|Flamengo|Catete|Glória|Laranjeiras|Cosme Velho|Humaitá|Urca|Lagoa|Jardim Botânico|Horto|Gávea|São Conrado|Rocinha|Vidigal|Peixoto|Arpoador",
  ),
  "Zona Oeste": list(
    "Barra da Tijuca|Recreio dos Bandeirantes|Recreio|Vargem Grande|Vargem Pequena|Camorim|Itanhangá|Joá|Grumari|Rio das Pedras|Muzema|Jacarepaguá|Taquara|Tanque|Pechincha|Anil|Curicica|Gardênia Azul|Cidade de Deus|Praça Seca|Vila Valqueire|Realengo|Padre Miguel|Bangu|Senador Camará|Vila Aliança|Magalhães Bastos|Vila Militar|Deodoro|Campo dos Afonsos|Jardim Sulacap|Sulacap|Santíssimo|Senador Vasconcelos|Campo Grande|Inhoaíba|Cosmos|Paciência|Santa Cruz|Sepetiba|Guaratiba|Barra de Guaratiba|Pedra de Guaratiba|Ilha de Guaratiba|Mendanha|Gericinó",
  ),
  "Zona Norte": list(
    "São Cristóvão|Benfica|Vasco da Gama|Mangueira|Caju|Maré|Manguinhos|Bonsucesso|Ramos|Olaria|Penha|Penha Circular|Vila da Penha|Brás de Pina|Vista Alegre|Irajá|Colégio|Vicente de Carvalho|Vila Kosmos|Cordovil|Parada de Lucas|Vigário Geral|Jardim América|Pavuna|Costa Barros|Acari|Anchieta|Guadalupe|Ricardo de Albuquerque|Coelho Neto|Barros Filho|Honório Gurgel|Rocha Miranda|Turiaçu|Madureira|Vaz Lobo|Campinho|Cascadura|Cavalcanti|Engenheiro Leal|Quintino Bocaiúva|Piedade|Encantado|Abolição|Pilares|Água Santa|Engenho de Dentro|Todos os Santos|Méier|Cachambi|Lins de Vasconcelos|Engenho Novo|Sampaio|Rocha|Riachuelo|São Francisco Xavier|Jacaré|Jacarezinho|Del Castilho|Inhaúma|Engenho da Rainha|Tomás Coelho|Higienópolis|Maria da Graça|Bento Ribeiro|Marechal Hermes|Oswaldo Cruz|Osvaldo Cruz|Complexo do Alemão|Ilha do Governador|Ribeira|Portuguesa|Jardim Guanabara|Cocotá|Tauá|Moneró|Zumbi|Pitangueiras|Bancários|Cacuia|Galeão|Praia da Bandeira",
  ),
};

/** Municípios fora da capital por região (nomes já normalizados). */
const CITIES: Record<string, Region> = {};
for (const city of list("Niterói|São Gonçalo")) CITIES[city] = "Niterói ou São Gonçalo";
for (const city of list(
  "Duque de Caxias|Nova Iguaçu|São João de Meriti|Belford Roxo|Nilópolis|Mesquita|Queimados|Japeri|Magé|Guapimirim|Itaguaí|Seropédica|Paracambi",
)) {
  CITIES[city] = "Baixada Fluminense";
}
for (const city of list(
  "Maricá|Saquarema|Araruama|Iguaba Grande|São Pedro da Aldeia|Cabo Frio|Arraial do Cabo|Armação dos Búzios|Búzios",
)) {
  CITIES[city] = "Maricá ou Região dos Lagos";
}

const RIO_CITY = normalizeName("Rio de Janeiro");

const NEIGHBORHOOD_TO_REGION = new Map<string, Region>();
for (const [region, names] of Object.entries(RIO_NEIGHBORHOODS)) {
  for (const name of names) NEIGHBORHOOD_TO_REGION.set(name, region as Region);
}

/** Nomes que existem em mais de uma região: não dá para adivinhar, a pessoa escolhe. */
// (Freguesia é bairro tanto da Ilha do Governador, Zona Norte, quanto de Jacarepaguá, Zona Oeste.)
const AMBIGUOUS = new Set(list("Freguesia"));

export interface AddressForRegion {
  city?: string;
  neighborhood?: string;
}

/**
 * Região do endereço, ou `null` se não dá para saber (aí a pessoa escolhe).
 *
 * `verified`: cidade e bairro vieram de uma consulta de CEP. Só nesse caso uma
 * cidade fora das listas vira "Outra região" — texto digitado no cadastro pode
 * ter erro de digitação ou ser inventado, então ali só vale o que reconhecemos.
 */
export function classifyRegion(
  address: AddressForRegion,
  options: { verified: boolean },
): Region | null {
  const city = normalizeName(address.city);
  if (!city) return null;

  if (city === RIO_CITY) {
    const name = normalizeName(address.neighborhood);
    if (!name || AMBIGUOUS.has(name)) return null;
    return NEIGHBORHOOD_TO_REGION.get(name) ?? null;
  }
  if (CITIES[city]) return CITIES[city];
  return options.verified ? REGION_OTHER : null;
}

export interface RegionDetection {
  region: Region | null;
  /** De onde veio: consulta do CEP, texto do cadastro ou nenhuma. */
  source: "cep" | "cadastro" | null;
}

/**
 * 1º consulta o CEP; se falhar (CEP inexistente, sem internet, demora), tenta
 * com a cidade e o bairro digitados no cadastro. `lookup` existe para os testes.
 */
export async function detectRegion(
  address: { zip?: string; city?: string; neighborhood?: string } | undefined,
  lookup: (zip: string | undefined) => Promise<CepInfo | null> = lookupCep,
): Promise<RegionDetection> {
  if (!address) return { region: null, source: null };

  const fromCep = await lookup(address.zip);
  if (fromCep) {
    const region = classifyRegion(fromCep, { verified: true });
    if (region) return { region, source: "cep" };
  }

  const fromProfile = classifyRegion(
    { city: address.city, neighborhood: address.neighborhood },
    { verified: false },
  );
  return fromProfile
    ? { region: fromProfile, source: "cadastro" }
    : { region: null, source: null };
}
