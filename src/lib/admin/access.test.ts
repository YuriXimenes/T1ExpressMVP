import { describe, expect, it } from "vitest";
import {
  STAFF_AREAS,
  areaForPath,
  can,
  payRulesText,
  toggleMatrix,
  type StaffAccess,
} from "@/lib/admin/access";
import { ADMIN_NAV } from "@/components/admin/shell/nav";

const operacao: StaffAccess = {
  status: "ativo",
  roleId: "r",
  roleName: "Operação",
  isSystem: false,
  permissions: { pedidos: { view: true, edit: true }, lojas: { view: true } },
};

describe("permissões", () => {
  it("segue a matriz do perfil", () => {
    expect(can(operacao, "pedidos", "edit")).toBe(true);
    expect(can(operacao, "pedidos", "delete")).toBe(false);
    expect(can(operacao, "lojas")).toBe(true);
    expect(can(operacao, "precos")).toBe(false);
  });

  it("Administrador pode tudo; inativo e sem acesso, nada", () => {
    const admin = { ...operacao, isSystem: true, permissions: {} };
    expect(can(admin, "pessoas", "delete")).toBe(true);
    expect(can({ ...admin, status: "inativo" }, "pedidos")).toBe(false);
    expect(can(null, "pedidos")).toBe(false);
  });

  it("criar/editar/excluir marcam ver; tirar ver limpa tudo", () => {
    expect(toggleMatrix({}, "edit", true)).toEqual({ edit: true, view: true });
    expect(toggleMatrix({ view: true, edit: true }, "view", false)).toEqual({});
    expect(toggleMatrix({ view: true, edit: true }, "edit", false)).toEqual({
      view: true,
      edit: false,
    });
  });
});

describe("áreas", () => {
  it("todo item do menu pertence a uma área", () => {
    const hrefs = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.href));
    const mapped = STAFF_AREAS.flatMap((a) => a.hrefs);
    expect(hrefs.filter((h) => !mapped.includes(h))).toEqual([]);
  });

  it("o detalhe herda a área da lista", () => {
    expect(areaForPath("/admin/pedidos/123")).toBe("pedidos");
    expect(areaForPath("/admin/pedidos/historico")).toBe("pedidos");
    expect(areaForPath("/admin/usuarios/abc")).toBe("usuarios");
    expect(areaForPath("/admin")).toBe("dashboard");
  });
});

describe("remuneração", () => {
  it("soma as regras num texto", () => {
    expect(
      payRulesText([
        { kind: "fixo_mensal", amountBRL: 1500 },
        { kind: "por_parada", amountBRL: 8 },
        { kind: "por_km", amountBRL: 0.9 },
      ]),
    ).toBe("R$ 1.500,00/mês + R$ 8,00/parada + R$ 0,90/km");
    expect(payRulesText([])).toBe("Sem remuneração cadastrada");
  });
});
