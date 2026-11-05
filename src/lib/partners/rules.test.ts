import { describe, expect, it } from "vitest";
import {
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  monthLabel,
  nthBusinessDay,
  receivesPayment,
  requiredDocs,
  validateOnboarding,
} from "@/lib/partners/rules";

describe("documentos do KYC", () => {
  it("coleta: 4 obrigatórios, sem comprovante bancário, + alvará opcional", () => {
    const docs = requiredDocs("coleta");
    expect(docs.filter((d) => d.min > 0).map((d) => d.kind)).toEqual([
      "cnpj",
      "contrato_social",
      "doc_responsavel",
      "comprovante_endereco",
    ]);
    expect(docs.find((d) => d.kind === "alvara")?.min).toBe(0);
  });

  it("só ponto de retirada pede comprovante bancário e recebe da T1", () => {
    for (const kind of ["retirada", "ambos"] as const) {
      expect(requiredDocs(kind).some((d) => d.kind === "comprovante_bancario")).toBe(
        true,
      );
      expect(receivesPayment(kind)).toBe(true);
    }
    expect(requiredDocs("coleta").some((d) => d.kind === "comprovante_bancario")).toBe(
      false,
    );
    expect(receivesPayment("coleta")).toBe(false);
    expect(receivesPayment(undefined)).toBe(false);
  });

  it("ponto de retirada pede 2 fotos do local", () => {
    expect(requiredDocs("retirada").find((d) => d.kind === "foto_local")?.min).toBe(2);
    expect(requiredDocs("ambos").some((d) => d.kind === "foto_local")).toBe(true);
    expect(requiredDocs("coleta").some((d) => d.kind === "foto_local")).toBe(false);
  });
});

describe("5º dia útil (igual a _nth_business_day)", () => {
  it("pula feriado e fim de semana", () => {
    expect(nthBusinessDay("2026-11", 5)).toBe("2026-11-09"); // 02/11 Finados
    expect(nthBusinessDay("2026-12", 5)).toBe("2026-12-07");
    expect(nthBusinessDay("2027-01", 1)).toBe("2027-01-04"); // 01/01 feriado, 02-03 fim de semana
  });

  it("rótulo do mês", () => {
    expect(monthLabel("2026-10")).toBe("Outubro de 2026");
  });
});

describe("CPF e CNPJ (iguais às funções do banco)", () => {
  it("valida dígitos", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("formata", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});

describe("validação do cadastro de parceiro", () => {
  const full = {
    legalName: "Loja Teste LTDA",
    tradeName: "Loja Teste",
    cnpj: "11.222.333/0001-81",
    responsibleName: "Fulano de Tal",
    responsibleCpf: "529.982.247-25",
    responsibleEmail: "fulano@example.com",
    responsiblePhone: "(21) 99999-0000",
    street: "Rua A",
    number: "10",
    city: "Rio de Janeiro",
    state: "RJ",
    termsAccepted: true,
  };
  const coletaDocs = [
    "cnpj",
    "contrato_social",
    "doc_responsavel",
    "comprovante_endereco",
  ].map((kind) => ({ kind, status: "pendente" }));

  it("formulário vazio lista tudo, na ordem da tela, sem esquecer o tipo", () => {
    const ids = validateOnboarding({}, []).map((i) => i.id);
    expect(ids.slice(0, 4)).toEqual(["ob-legal", "ob-trade", "ob-cnpj", "ob-kind"]);
    expect(ids).toContain("ob-uf");
    expect(ids).toContain("ob-terms");
    expect(ids).toContain("ob-doc-cnpj");
  });

  it("coleta completa não pede recebimento nem comprovante bancário", () => {
    expect(validateOnboarding({ ...full, kind: "coleta" }, coletaDocs)).toEqual([]);
  });

  it("ponto de retirada pede horário, recebimento, comprovante e fotos", () => {
    const ids = validateOnboarding({ ...full, kind: "retirada" }, coletaDocs).map(
      (i) => i.id,
    );
    expect(ids).toEqual([
      "ob-hours",
      "ob-payout",
      "ob-doc-comprovante_bancario",
      "ob-doc-foto_local",
    ]);
  });

  it("ponto de retirada completo passa", () => {
    const docs = [
      ...coletaDocs,
      { kind: "comprovante_bancario", status: "aceito" },
      { kind: "foto_local", status: "pendente" },
      { kind: "foto_local", status: "pendente" },
    ];
    expect(
      validateOnboarding(
        {
          ...full,
          kind: "ambos",
          hours: { "1": "10:00-19:00" },
          payout: { method: "pix", pixKey: "11222333000181" },
        },
        docs,
      ),
    ).toEqual([]);
  });

  it("documento recusado conta como faltando; Pix e conta pedem os campos certos", () => {
    const ids = validateOnboarding(
      { ...full, kind: "coleta" },
      coletaDocs.map((d) => (d.kind === "cnpj" ? { ...d, status: "recusado" } : d)),
    ).map((i) => i.id);
    expect(ids).toEqual(["ob-doc-cnpj"]);
    const bank = validateOnboarding(
      { ...full, kind: "retirada", hours: { "2": "9-18" }, payout: { method: "conta" } },
      [],
    ).map((i) => i.id);
    expect(bank).toEqual(expect.arrayContaining(["ob-bank", "ob-ag", "ob-acc"]));
  });

  it("mensagens específicas para CNPJ, CPF, e-mail e telefone inválidos", () => {
    const issues = validateOnboarding(
      {
        ...full,
        kind: "coleta",
        cnpj: "11222333000182",
        responsibleCpf: "111",
        responsibleEmail: "x",
        responsiblePhone: "123",
      },
      coletaDocs,
    );
    expect(issues.map((i) => [i.id, i.message])).toEqual([
      ["ob-cnpj", "CNPJ inválido."],
      ["ob-cpf", "CPF inválido."],
      ["ob-email", "E-mail inválido."],
      ["ob-phone", "Informe com DDD."],
    ]);
  });
});
