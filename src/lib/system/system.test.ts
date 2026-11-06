import { describe, expect, it } from "vitest";
import { fieldLabel, formatAuditValue, recordHref } from "@/lib/system/audit";
import { describeError, shouldIgnoreError, sourceForPath } from "@/lib/system/errors";
import { groupNotifications, type AdminNotification } from "@/lib/system/notifications";

describe("auditoria", () => {
  it("nomes de campo em português, com fallback legível", () => {
    expect(fieldLabel("status")).toBe("Situação");
    expect(fieldLabel("max_uses_per_user")).toBe("Usos por cliente");
    expect(fieldLabel("road_factor")).toBe("Road factor");
    expect(fieldLabel("payout_total_brl")).toBe("Payout total");
  });

  it("valores legíveis", () => {
    expect(formatAuditValue(null)).toBe("vazio");
    expect(formatAuditValue(true)).toBe("Sim");
    expect(formatAuditValue("2026-11-06")).toBe("06/11/2026");
    expect(formatAuditValue("2026-11-06T15:00:00+00:00")).toBe("06/11/2026, 12:00");
    expect(formatAuditValue("•••")).toBe("•••");
    expect(formatAuditValue(["a", "b"])).toBe("a, b");
  });

  it("link do registro ou da área", () => {
    const id = "0b0e2a3c-1111-4222-8333-444455556666";
    expect(recordHref("orders", id, "pedidos")).toBe(`/admin/pedidos/${id}`);
    expect(recordHref("claims", id, "sinistros")).toBe(
      `/admin/financeiro/sinistros/${id}`,
    );
    expect(recordHref("coupons", "T1NATAL", "cupons")).toBe("/admin/financeiro/cupons");
    expect(recordHref("x", undefined, "nao-existe")).toBeUndefined();
  });
});

describe("erros", () => {
  it("ignora ruído", () => {
    expect(shouldIgnoreError("Script error.")).toBe(true);
    expect(shouldIgnoreError("ResizeObserver loop limit exceeded")).toBe(true);
    expect(shouldIgnoreError("x", "at y (chrome-extension://abc/z.js:1:1)")).toBe(true);
    expect(shouldIgnoreError("   ")).toBe(true);
    expect(shouldIgnoreError("TypeError: cannot read 'id'")).toBe(false);
  });

  it("origem pela página", () => {
    expect(sourceForPath("/admin/pedidos")).toBe("admin");
    expect(sourceForPath("/pedido")).toBe("site");
  });

  it("descreve o que foi lançado", () => {
    expect(describeError(new TypeError("falhou")).message).toBe("TypeError: falhou");
    expect(describeError("texto").message).toBe("texto");
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
  });
});

describe("sino", () => {
  const n = (p: Partial<AdminNotification>): AdminNotification => ({
    key: Math.random().toString(),
    category: "financeiro",
    severity: "media",
    title: "x",
    href: "/admin",
    at: "2026-11-06T10:00:00Z",
    read: false,
    ...p,
  });

  it("não lidos e urgentes primeiro; categoria com urgente sobe", () => {
    const groups = groupNotifications([
      n({ key: "a", category: "financeiro", read: true, severity: "alta" }),
      n({ key: "b", category: "financeiro" }),
      n({ key: "c", category: "operacao", severity: "info" }),
      n({ key: "d", category: "clientes", severity: "alta" }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["clientes", "operacao", "financeiro"]);
    expect(groups[2].items.map((i) => i.key)).toEqual(["b", "a"]);
  });
});
