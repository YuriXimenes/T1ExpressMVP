import { describe, expect, it } from "vitest";
import { simulateFreight } from "@/lib/data/freight-simulation";
import { staticCatalog } from "@/lib/catalog/static";
import {
  SIMULATION_ANSWER_KEYS,
  buildSimulation,
  brl,
  simulationAnswers,
  simulationTotalBRL,
} from "@/lib/survey/simulation";
import type { CompetitorQuote } from "@/lib/types/freight";

const order = { originStoreIds: ["fs-02", "fs-08"], createdAt: "2026-10-19T13:00:00Z" };

describe("preço da simulação", () => {
  it("R$12 pela 1ª loja e R$3 por loja adicional", () => {
    expect([1, 2, 3, 4].map(simulationTotalBRL)).toEqual([12, 15, 18, 21]);
    expect(brl(21)).toBe("R$ 21,00");
  });
});

describe("custo em outros serviços", () => {
  const quotes: CompetitorQuote[] = [
    { carrier: "uber", label: "Uber", etaLabel: "~3 horas", totalBRL: 30.5 },
    { carrier: "loggi", label: "Loggi Express", etaLabel: "~3 horas", totalBRL: 44 },
    { carrier: "correios", label: "Correios", etaLabel: "~4 dias úteis", totalBRL: 26.5 },
  ];

  it("entra na simulação e nas chaves gravadas", () => {
    const sim = buildSimulation(order, quotes);
    expect(sim).toMatchObject({
      uberBRL: 30.5,
      loggiBRL: 44,
      correiosBRL: 26.5,
      totalBRL: 15,
    });
    const answers = simulationAnswers(sim);
    expect(answers).toMatchObject({
      sim_uber_brl: 30.5,
      sim_loggi_brl: 44,
      sim_correios_brl: 26.5,
    });
    for (const key of SIMULATION_ANSWER_KEYS) expect(answers).toHaveProperty(key);
  });

  it("arredonda para centavos (soma de rotas não grava 121.2299…)", () => {
    const sim = buildSimulation(order, [
      {
        carrier: "loggi",
        label: "Loggi Express",
        etaLabel: "~3 horas",
        totalBRL: 14.9 + 48.88 + 28.67 + 28.78,
      },
    ]);
    expect(sim.loggiBRL).toBe(121.23);
  });

  it("sem estimativa (rota não cadastrada), grava nulo em vez de zero", () => {
    const sim = buildSimulation(order);
    expect(sim.uberBRL).toBeNull();
    const answers = simulationAnswers(sim);
    expect(answers.sim_uber_brl).toBeNull();
    expect(answers.sim_loggi_brl).toBeNull();
    expect(answers.sim_correios_brl).toBeNull();
  });

  it("Uber ausente (rota sem Uber) não esconde Loggi e Correios", () => {
    const sim = buildSimulation(order, quotes.slice(1));
    expect(sim.uberBRL).toBeNull();
    expect(sim.loggiBRL).toBe(44);
    expect(sim.correiosBRL).toBe(26.5);
  });

  it("sem rota cadastrada o simulador de frete recusa; a simulação então não mostra comparação", () => {
    // A tela faz try/catch nisto e esconde a seção (competitors = []).
    expect(() =>
      simulateFreight(
        { originStoreIds: ["fs-02"], destinationStoreId: "fs-01" },
        {
          stores: staticCatalog.stores,
          routes: [],
          correiosFlatRateBRL: staticCatalog.correiosFlatRateBRL,
          pricing: staticCatalog.pricing,
        },
      ),
    ).toThrow();
  });

  it("usa a mesma conta do simulador de frete do site", () => {
    const { competitors } = simulateFreight(
      { originStoreIds: ["fs-02", "fs-08"], destinationStoreId: "fs-01" },
      {
        stores: staticCatalog.stores,
        routes: staticCatalog.freightRoutes,
        correiosFlatRateBRL: staticCatalog.correiosFlatRateBRL,
        pricing: staticCatalog.pricing,
      },
    );
    const sim = buildSimulation(order, competitors);
    // Correios cobra a tarifa fixa por loja de origem.
    expect(sim.correiosBRL).toBe(staticCatalog.correiosFlatRateBRL * 2);
    expect(sim.loggiBRL).toBeGreaterThan(0);
  });
});
