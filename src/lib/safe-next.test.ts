import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("aceita caminhos internos", () => {
    expect(safeNext("/pedido")).toBe("/pedido");
    expect(safeNext("/pedidos/abc?x=1")).toBe("/pedidos/abc?x=1");
    expect(safeNext("/")).toBe("/");
  });

  it("recusa tentativas de redirecionar para outro site", () => {
    expect(safeNext("https://evil.com")).toBe("/conta");
    expect(safeNext("//evil.com")).toBe("/conta");
    expect(safeNext("/\\evil.com")).toBe("/conta");
  });

  it("recusa caracteres de controle e valores ausentes", () => {
    expect(safeNext("/a\nb")).toBe("/conta");
    expect(safeNext("/\t/evil.com")).toBe("/conta");
    expect(safeNext("")).toBe("/conta");
    expect(safeNext(undefined)).toBe("/conta");
    expect(safeNext(null)).toBe("/conta");
  });
});
