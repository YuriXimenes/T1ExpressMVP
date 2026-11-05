import { describe, expect, it } from "vitest";
import {
  autoTotal,
  claimDeclared,
  claimSuggestion,
  currentMonthKey,
  manualCosts,
  margin,
  shiftMonth,
  teamTotal,
} from "@/lib/finance/rules";

describe("repasse da equipe (igual a _team_statement)", () => {
  it("viagens + fixo + avulsos", () => {
    expect(teamTotal(80, 1500, [50])).toBe(1630);
    expect(teamTotal(0, 1200, [])).toBe(1200);
    expect(teamTotal(35.5, 0, [10, -5.25])).toBe(40.25);
  });
});

describe("sinistro (igual a _claim_declared)", () => {
  it("declarado afetado por modo de preço", () => {
    expect(
      claimDeclared([{ price: 40, priceMode: "unit", quantity: 2, affected: 1 }]),
    ).toBe(40);
    expect(
      claimDeclared([{ price: 90, priceMode: "total", quantity: 3, affected: 2 }]),
    ).toBe(60);
    expect(
      claimDeclared([
        { price: 10, priceMode: "unit", quantity: 5, affected: 5 },
        { price: 30, priceMode: "total", quantity: 1, affected: 1 },
      ]),
    ).toBe(80);
  });

  it("sugestão é o menor entre declarado e cobertura", () => {
    expect(claimSuggestion(500, 100)).toBe(100);
    expect(claimSuggestion(40, 100)).toBe(40);
  });
});

describe("painel", () => {
  it("margem e %", () => {
    expect(margin(1000, 750)).toEqual({ value: 250, pct: 25 });
    expect(margin(200, 260)).toEqual({ value: -60, pct: -30 });
    expect(margin(0, 50)).toEqual({ value: -50, pct: null });
  });

  it("meses", () => {
    expect(currentMonthKey(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10"); // 23h de 31/10 em Brasília
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
  });
});

describe("custos do mês na tela de Despesas", () => {
  it("automáticos somam combustível, equipe, lojas, sinistros e reembolsos", () => {
    expect(
      autoTotal({
        fuel: { total: 13.37 },
        team: { total: 3540 },
        stores: { total: 120.5 },
        claims: { total: 40 },
        refunds: { total: 30 },
      }),
    ).toBe(3743.87);
  });

  it("lançadas só contam quando aprovadas ou pagas", () => {
    expect(
      manualCosts([
        { status: "pendente", amount: 100 },
        { status: "aprovada", amount: 50.5 },
        { status: "paga", amount: 20 },
        { status: "recusada", amount: 999 },
      ]),
    ).toBe(70.5);
  });
});
