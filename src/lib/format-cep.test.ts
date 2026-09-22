import { describe, expect, it } from "vitest";
import { formatCep } from "@/lib/format-cep";

describe("formatCep", () => {
  it("não formata enquanto tem 5 dígitos ou menos", () => {
    expect(formatCep("")).toBe("");
    expect(formatCep("2")).toBe("2");
    expect(formatCep("20000")).toBe("20000");
  });

  it("insere o hífen depois do 5º dígito", () => {
    expect(formatCep("200001")).toBe("20000-1");
    expect(formatCep("20000000")).toBe("20000-000");
  });

  it("ignora caracteres não numéricos e limita a 8 dígitos", () => {
    expect(formatCep("20.000-000")).toBe("20000-000");
    expect(formatCep("200000001234")).toBe("20000-000");
  });
});
