import { describe, expect, it } from "vitest";
import { makePedidoGroup } from "@/lib/order-helpers";
import type { PedidoGroup } from "@/lib/types/order";
import { matchStore, sameStore } from "./match-store";
import type { ImportedItem } from "./parse-order";
import { applyImportPlan, normalizeOrderNumber, planImport } from "./plan-import";
import { importedToGroup } from "./to-groups";

const item = (name: string, unitPrice: number, quantity = 1): ImportedItem => ({
  name,
  quantity,
  unitPrice,
  total: unitPrice * quantity,
  foil: false,
  doubtful: false,
});
const spider = item("Spider-Man, Web-Slinger", 2.25);
const sagu = item("Sagu Wildling // Roost Seek", 6.98);
const bolt = item("Lightning Bolt", 4, 3);

describe("sameStore", () => {
  it("reconhece a mesma loja escrita de outro jeito", () => {
    expect(sameStore("jaerahora", "Já Era Hora!")).toBe(true);
    expect(sameStore("JA ERA HORA", "Já Era Hora!")).toBe(true);
    expect(sameStore("Cards Of Paradise", "Cards of Paradise")).toBe(true);
    expect(sameStore("Cards Of Paradlse", "Cards of Paradise")).toBe(true);
    expect(sameStore("Magic Store", "Magic Store Brasil")).toBe(true);
  });
  it("não confunde lojas diferentes", () => {
    expect(sameStore("Cards Of Paradise", "Magic Store Brasil")).toBe(false);
    expect(sameStore("Bruno Pokecartas", "Já Era Hora!")).toBe(false);
    expect(sameStore("Card Store", "Magic Store")).toBe(false);
  });
  it("matchStore usa a mesma tolerância", () => {
    const lojas = [
      { id: "a", name: "Já Era Hora!" },
      { id: "b", name: "Cards of Paradise" },
    ];
    expect(matchStore("jaerahora", lojas)?.id).toBe("a");
  });
});

describe("planImport / applyImportPlan", () => {
  it("compara o nº só pelos dígitos", () => {
    expect(normalizeOrderNumber("#12523369")).toBe("12523369");
    expect(normalizeOrderNumber(" 12523369 ")).toBe("12523369");
  });

  it("lote vazio é substituído por um lote novo", () => {
    const blank = makePedidoGroup();
    const current = { s: [blank] };
    const plan = planImport(current, [
      { storeId: "s", orderNumber: "12523369", items: [spider] },
    ]);
    expect(plan[0]).toMatchObject({ action: "new", items: [spider], duplicates: [] });
    const next = applyImportPlan(current, plan, "magic");
    expect(next.s).toHaveLength(1);
    expect(next.s[0]).toMatchObject({ orderNumber: "12523369", kind: "cartas-avulsas" });
  });

  it("mesmo nº: acrescenta no lote já aberto", () => {
    const lot = importedToGroup([spider], "#12523369", "magic");
    const current = { s: [lot] };
    const plan = planImport(current, [
      { storeId: "s", orderNumber: "12523369", items: [sagu] },
    ]);
    expect(plan[0]).toMatchObject({ action: "append", targetGroupId: lot.id });
    const next = applyImportPlan(current, plan, "magic");
    expect(next.s).toHaveLength(1);
    expect(next.s[0].cardItems.map((c) => c.cardName)).toEqual([
      "Spider-Man, Web-Slinger",
      "Sagu Wildling // Roost Seek",
    ]);
  });

  it("nº diferente: abre lote novo e mantém o anterior", () => {
    const lot = importedToGroup([spider], "12523369", "magic");
    const current = { s: [lot] };
    const plan = planImport(current, [
      { storeId: "s", orderNumber: "99887766", items: [bolt] },
    ]);
    expect(plan[0].action).toBe("new");
    const next = applyImportPlan(current, plan, "pokemon");
    expect(next.s.map((g) => g.orderNumber)).toEqual(["12523369", "99887766"]);
    expect(next.s[1].cardItems[0]).toMatchObject({
      cardName: "Lightning Bolt",
      quantity: 3,
      game: "pokemon",
    });
  });

  it("sem nº: sempre lote novo", () => {
    const lot = importedToGroup([spider], "", "magic");
    const current = {
      s: [{ ...lot, orderNumber: "", cardItems: lot.cardItems }] as PedidoGroup[],
    };
    const plan = planImport(current, [{ storeId: "s", orderNumber: "", items: [sagu] }]);
    expect(plan[0].action).toBe("new");
  });

  it("cartas repetidas não duplicam, a menos que o cliente marque", () => {
    const lot = importedToGroup([spider, sagu], "12523369", "magic");
    const current = { s: [lot] };
    const plan = planImport(current, [
      { storeId: "s", orderNumber: "12523369", items: [spider, sagu, bolt] },
    ]);
    expect(plan[0].items).toEqual([bolt]);
    expect(plan[0].duplicates).toEqual([spider, sagu]);
    expect(applyImportPlan(current, plan, "magic").s[0].cardItems).toHaveLength(3);
    expect(applyImportPlan(current, plan, "magic", true).s[0].cardItems).toHaveLength(5);
  });

  it("tudo repetido: nada muda", () => {
    const lot = importedToGroup([spider], "12523369", "magic");
    const current = { s: [lot] };
    const plan = planImport(current, [
      { storeId: "s", orderNumber: "12523369", items: [spider] },
    ]);
    expect(applyImportPlan(current, plan, "magic")).toEqual({});
  });

  it("dois blocos com o mesmo nº na mesma importação viram um só", () => {
    const current = { s: [makePedidoGroup()] };
    const plan = planImport(current, [
      { storeId: "s", orderNumber: "#123", items: [spider] },
      { storeId: "s", orderNumber: "123", items: [sagu] },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].items).toEqual([spider, sagu]);
  });

  it("várias lojas: cada bloco vai para a sua", () => {
    const lot = importedToGroup([spider], "111", "magic");
    const current = { a: [lot], b: [makePedidoGroup()] };
    const plan = planImport(current, [
      { storeId: "a", orderNumber: "111", items: [sagu] },
      { storeId: "b", orderNumber: "222", items: [bolt] },
    ]);
    const next = applyImportPlan(current, plan, "magic");
    expect(next.a[0].cardItems).toHaveLength(2);
    expect(next.b.map((g) => g.orderNumber)).toEqual(["222"]);
  });
});
