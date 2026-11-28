import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Garante que o tema novo não vaza para o admin, a loja e o entregador:
// todo CSS do bloco SITE-V2 de globals.css fica preso a .site-v2.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const start = css.indexOf("SITE-V2 · layout novo");
const end = css.indexOf("SITE-V2 · fim");
const block = css.slice(start, end);
const before = css.slice(0, start);

describe("isolamento do layout novo", () => {
  it("o bloco existe uma vez", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it("toda regra fora do @theme começa com .site-v2", () => {
    const noComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
    const noTheme = noComments.replace(/@theme inline\s*\{[\s\S]*?\n\}/, "");
    const selectors = [...noTheme.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of selectors) {
      for (const part of s.split(",")) expect(part.trim().startsWith(".site-v2")).toBe(true);
    }
  });

  it("o @theme só cria nomes novos t1-*", () => {
    const theme = block.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const names = [...theme.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(n).toMatch(/^(color|font|radius|shadow)-t1(-|$)/);
  });

  it("nenhum token --t1-* é definido fora de .site-v2", () => {
    expect(before).not.toMatch(/--t1-[a-z0-9-]+\s*:/);
  });
});
