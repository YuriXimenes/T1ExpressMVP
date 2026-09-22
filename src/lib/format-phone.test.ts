import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format-phone";

describe("formatPhone", () => {
  it("formata progressivamente conforme os dígitos chegam", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("2")).toBe("(2");
    expect(formatPhone("21")).toBe("(21");
    expect(formatPhone("219")).toBe("(21)9");
    expect(formatPhone("2191234")).toBe("(21)91234");
    expect(formatPhone("21912345678")).toBe("(21)91234-5678");
  });

  it("ignora caracteres não numéricos e limita a 11 dígitos", () => {
    expect(formatPhone("(21) 91234-5678")).toBe("(21)91234-5678");
    expect(formatPhone("219123456789999")).toBe("(21)91234-5678");
  });
});
