import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("deixa texto simples e acentos como estão", () => {
    expect(csvCell("Pokémon")).toBe("Pokémon");
    expect(csvCell("")).toBe("");
    expect(csvCell(null)).toBe("");
  });

  it("protege ponto e vírgula, aspas e quebras de linha", () => {
    expect(csvCell("Loja A; Loja B")).toBe('"Loja A; Loja B"');
    expect(csvCell('Disse "ótimo"')).toBe('"Disse ""ótimo"""');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
  });

  it("números com vírgula decimal", () => {
    expect(csvCell(12.4)).toBe("12,4");
    expect(csvCell(0)).toBe("0");
  });
});

describe("toCsv", () => {
  it("começa com BOM, separa por ; e termina linhas com CRLF", () => {
    const csv = toCsv(["Nome", "Valor"], [["Ana", "R$ 12,40"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Nome;Valor\r\nAna;R$ 12,40\r\n");
  });
});
