import { describe, expect, it } from "vitest";
import { kmBetween, routeKm, suggestOrder } from "@/lib/routes/geo";
import {
  groupBacklog,
  routePairs,
  sharedStores,
  stopReasonLabel,
} from "@/lib/routes/planning";

const base = { lat: -22.9, lng: -43.2 };
const a = { lat: -22.91, lng: -43.18 };
const b = { lat: -22.92, lng: -43.19 };

describe("distâncias", () => {
  it("haversine em km", () => {
    expect(kmBetween(base, base)).toBe(0);
    // ~2,4 km entre base e a.
    expect(kmBetween(base, a)).toBeGreaterThan(2.2);
    expect(kmBetween(base, a)).toBeLessThan(2.6);
  });

  it("percurso sai e volta à base, com fator de ruas", () => {
    const straight = kmBetween(base, a) + kmBetween(a, b) + kmBetween(b, base);
    expect(routeKm([a, b], base, 1.3)).toBeCloseTo(straight * 1.3, 1);
    expect(routeKm([a, null, b], base, 1)).toBeCloseTo(straight, 1);
    expect(routeKm([], base, 1.3)).toBe(0);
  });

  it("sugere a ordem pelo vizinho mais próximo", () => {
    const far = { lat: -23.0, lng: -43.4 };
    const items = [
      { id: "far", p: far },
      { id: "sem", p: null },
      { id: "a", p: a },
      { id: "b", p: b },
    ];
    expect(suggestOrder(items, (i) => i.p, base).map((i) => i.id)).toEqual([
      "a",
      "b",
      "far",
      "sem",
    ]);
  });
});

describe("planejamento", () => {
  it("agrupa por loja, pendentes e mais urgentes primeiro", () => {
    const groups = groupBacklog([
      {
        orderId: "1",
        storeCode: "fs-02",
        customerName: "A",
        createdAt: "2026-11-01",
        estimatedPickupDate: "2026-11-10",
      },
      {
        orderId: "2",
        storeCode: "fs-01",
        customerName: "B",
        createdAt: "2026-11-01",
        estimatedPickupDate: "2026-11-08",
      },
      {
        orderId: "3",
        storeCode: "fs-01",
        customerName: "C",
        createdAt: "2026-11-01",
        estimatedPickupDate: "2026-11-05",
        openRouteId: "r",
      },
      {
        orderId: "4",
        storeCode: "fs-03",
        customerName: "D",
        createdAt: "2026-11-01",
        openRouteId: "r",
      },
    ]);
    expect(groups.map((g) => g.storeCode)).toEqual(["fs-01", "fs-02", "fs-03"]);
    expect(groups[0]).toMatchObject({ pending: 1, urgentDate: "2026-11-08" });
    expect(groups[0].orders.map((o) => o.orderId)).toEqual(["3", "2"]);
    expect(groups[2].pending).toBe(0);
  });

  it("rótulo do motivo", () => {
    expect(stopReasonLabel("loja_fechada")).toBe("Loja fechada");
  });
});

describe("união de coleta e entrega", () => {
  const route = (id: string, kind: string, day: string, codes: string[]) => ({
    id,
    kind,
    day,
    stops: codes.map((storeCode) => ({ storeCode })),
  });

  it("lojas em comum, sem repetir", () => {
    expect(
      sharedStores(
        route("a", "coleta", "d", ["x", "y", "x"]),
        route("b", "entrega", "d", ["y", "x"]),
      ),
    ).toEqual(["x", "y"]);
    expect(
      sharedStores(route("a", "coleta", "d", ["x"]), route("b", "entrega", "d", ["z"])),
    ).toEqual([]);
  });

  it("pares coleta × entrega só no mesmo dia e com loja em comum", () => {
    const pairs = routePairs([
      route("c1", "coleta", "2026-11-06", ["x", "y"]),
      route("e1", "entrega", "2026-11-06", ["y"]),
      route("e2", "entrega", "2026-11-09", ["x"]),
      route("e3", "entrega", "2026-11-06", ["z"]),
    ]);
    expect(pairs.map((p) => [p.coleta.id, p.entrega.id, p.stores])).toEqual([
      ["c1", "e1", ["y"]],
    ]);
  });
});
