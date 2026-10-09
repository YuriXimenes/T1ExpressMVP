import { describe, expect, it } from "vitest";
import {
  REGIONS,
  REGION_OTHER,
  RIO_NEIGHBORHOODS,
  classifyRegion,
  detectRegion,
  normalizeName,
} from "@/lib/survey/regions";

const rio = (neighborhood: string) => ({ city: "Rio de Janeiro", neighborhood });
const verified = { verified: true };
const typed = { verified: false };

describe("normalizeName", () => {
  it("ignora acento, maiúscula e pontuação", () => {
    expect(normalizeName("  São  João-de Meriti ")).toBe("sao joao de meriti");
    expect(normalizeName("PRAÇA DA BANDEIRA")).toBe("praca da bandeira");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("classifyRegion — cidade do Rio", () => {
  it.each([
    ["Tijuca", "Grande Tijuca"],
    ["Vila Isabel", "Grande Tijuca"],
    ["praça da bandeira", "Grande Tijuca"],
    ["Centro", "Centro"],
    ["Lapa", "Centro"],
    ["Copacabana", "Zona Sul"],
    ["Jardim Botânico", "Zona Sul"],
    ["Barra da Tijuca", "Zona Oeste"],
    ["Santíssimo", "Zona Oeste"],
    ["Campo Grande", "Zona Oeste"],
    ["Méier", "Zona Norte"],
    ["Ilha do Governador", "Zona Norte"],
    ["Madureira", "Zona Norte"],
  ])("%s → %s", (neighborhood, expected) => {
    expect(classifyRegion(rio(neighborhood), verified)).toBe(expected);
    expect(classifyRegion(rio(neighborhood), typed)).toBe(expected);
  });

  it("bairro fora da lista ou de nome repetido não é adivinhado", () => {
    expect(classifyRegion(rio("Bairro Inventado"), verified)).toBeNull();
    expect(classifyRegion(rio("Freguesia"), verified)).toBeNull();
    expect(classifyRegion(rio(""), verified)).toBeNull();
  });
});

describe("classifyRegion — outras cidades", () => {
  it.each([
    ["Niterói", "Niterói ou São Gonçalo"],
    ["São Gonçalo", "Niterói ou São Gonçalo"],
    ["Duque de Caxias", "Baixada Fluminense"],
    ["Nova Iguaçu", "Baixada Fluminense"],
    ["São João de Meriti", "Baixada Fluminense"],
    ["Maricá", "Maricá ou Região dos Lagos"],
    ["Cabo Frio", "Maricá ou Região dos Lagos"],
    ["Armação dos Búzios", "Maricá ou Região dos Lagos"],
  ])("%s → %s", (city, expected) => {
    expect(classifyRegion({ city, neighborhood: "Qualquer" }, typed)).toBe(expected);
  });

  it("cidade conhecida pelo CEP e fora das listas vira 'Outra região'", () => {
    expect(classifyRegion({ city: "Petrópolis" }, verified)).toBe(REGION_OTHER);
    expect(classifyRegion({ city: "São Paulo" }, verified)).toBe(REGION_OTHER);
  });

  it("cidade digitada à mão e desconhecida NÃO vira 'Outra região'", () => {
    expect(classifyRegion({ city: "Bobolândia" }, typed)).toBeNull();
    expect(classifyRegion({ city: "" }, verified)).toBeNull();
  });
});

describe("listas", () => {
  it("as 9 regiões, 'Outra região' por último", () => {
    expect(REGIONS).toHaveLength(9);
    expect(REGIONS[REGIONS.length - 1]).toBe(REGION_OTHER);
  });

  it("nenhum bairro está em duas regiões nem repetido na mesma", () => {
    const all = Object.values(RIO_NEIGHBORHOODS).flat();
    expect(all.length).toBeGreaterThan(150);
    const repeated = all.filter((name, i) => all.indexOf(name) !== i);
    expect(repeated).toEqual([]);
  });

  it("o bairro 'ambíguo' (Freguesia) não está em nenhuma lista", () => {
    expect(Object.values(RIO_NEIGHBORHOODS).flat()).not.toContain("freguesia");
  });
});

describe("detectRegion", () => {
  const address = { zip: "20520-054", city: "Rio de Janeiro", neighborhood: "Tijuca" };

  it("usa o que o CEP devolve", async () => {
    const lookup = async () => ({
      city: "Rio de Janeiro",
      neighborhood: "Copacabana",
      uf: "RJ",
    });
    // O CEP manda mesmo que o texto do cadastro diga outra coisa.
    expect(await detectRegion(address, lookup)).toEqual({
      region: "Zona Sul",
      source: "cep",
    });
  });

  it("CEP de cidade fora da lista → Outra região", async () => {
    const lookup = async () => ({ city: "Petrópolis", neighborhood: "Centro", uf: "RJ" });
    expect(await detectRegion(address, lookup)).toEqual({
      region: REGION_OTHER,
      source: "cep",
    });
  });

  it("CEP sem resposta cai no texto do cadastro", async () => {
    expect(await detectRegion(address, async () => null)).toEqual({
      region: "Grande Tijuca",
      source: "cadastro",
    });
  });

  it("CEP no Rio com bairro desconhecido cai no cadastro; sem nada reconhecido, fica sem região", async () => {
    const lookup = async () => ({
      city: "Rio de Janeiro",
      neighborhood: "Bairro Novo",
      uf: "RJ",
    });
    expect(await detectRegion(address, lookup)).toEqual({
      region: "Grande Tijuca",
      source: "cadastro",
    });
    expect(
      await detectRegion(
        { zip: "16848-646", city: "Bobolândia", neighborhood: "Bobo" },
        async () => null,
      ),
    ).toEqual({ region: null, source: null });
  });

  it("sem endereço cadastrado", async () => {
    expect(await detectRegion(undefined, async () => null)).toEqual({
      region: null,
      source: null,
    });
  });
});
