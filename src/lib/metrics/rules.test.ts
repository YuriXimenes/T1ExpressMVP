import { describe, expect, it } from "vitest";
import {
  biggestDrop,
  funnelSteps,
  rate,
  routeKey,
  savingsBucket,
} from "@/lib/metrics/rules";

describe("rate", () => {
  it("percentual com 1 casa; sem base = null", () => {
    expect(rate(1, 3)).toBe(33.3);
    expect(rate(0, 10)).toBe(0);
    expect(rate(5, 0)).toBeNull();
  });
});

describe("funnelSteps", () => {
  const steps = funnelSteps({
    simulations: 200,
    continued: 80,
    orderPage: 60,
    ordersCreated: 30,
    paid: 24,
    completed: 10,
  });

  it("taxa sobre a etapa anterior e sobre o topo", () => {
    expect(steps[0].fromPrevious).toBeNull();
    expect(steps[0].fromTop).toBe(100);
    expect(steps[1].fromPrevious).toBe(40);
    expect(steps[4].fromPrevious).toBe(80);
    expect(steps[4].fromTop).toBe(12);
  });

  it("acha a maior perda", () => {
    expect(biggestDrop(steps)?.key).toBe("continued");
  });

  it("sem simulações não divide por zero", () => {
    const empty = funnelSteps({
      simulations: 0,
      continued: 0,
      orderPage: 0,
      ordersCreated: 0,
      paid: 0,
      completed: 0,
    });
    expect(empty.every((s) => s.fromTop === null)).toBe(true);
    expect(biggestDrop(empty)).toBeNull();
  });
});

describe("savingsBucket", () => {
  it("faixas iguais às do banco", () => {
    expect(savingsBucket({ failed: true, hasCompetitor: true })).toBe("falhou");
    expect(savingsBucket({ failed: false, hasCompetitor: false })).toBe("sem_comparacao");
    expect(savingsBucket({ failed: false, hasCompetitor: true, savings: null })).toBe(
      "nao_mais_barata",
    );
    expect(savingsBucket({ failed: false, hasCompetitor: true, savings: 4.99 })).toBe(
      "ate_5",
    );
    expect(savingsBucket({ failed: false, hasCompetitor: true, savings: 5 })).toBe(
      "5_a_15",
    );
    expect(savingsBucket({ failed: false, hasCompetitor: true, savings: 15 })).toBe(
      "acima_15",
    );
  });
});

describe("routeKey", () => {
  it("ordena e tira repetidas", () => {
    expect(routeKey(["fs-09", "fs-02", "fs-09"], "fs-01")).toBe("fs-02+fs-09>fs-01");
  });
});
