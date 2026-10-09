import { describe, expect, it } from "vitest";
import {
  addDays,
  computeSchedule,
  formatOrderMoment,
  formatScheduleDate,
  holidaysOf,
  isOperatingDay,
  weekdayOf,
} from "@/lib/operating-calendar";

// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
const at = (local: string) => computeSchedule(`${local}-03:00`);

describe("regra de coleta e retirada (seus exemplos)", () => {
  // Semana de 19/10/2026: segunda 19, terça 20, quarta 21, sexta 23, sábado 24.
  it("segunda → coleta segunda, retirada quarta", () => {
    expect(at("2026-10-19T10:00:00")).toEqual({
      collect: "2026-10-19",
      pickup: "2026-10-21",
    });
  });
  it("terça → coleta quarta, retirada sexta", () => {
    expect(at("2026-10-20T10:00:00")).toEqual({
      collect: "2026-10-21",
      pickup: "2026-10-23",
    });
  });
  it("quarta → coleta quarta, retirada sexta", () => {
    expect(at("2026-10-21T10:00:00")).toEqual({
      collect: "2026-10-21",
      pickup: "2026-10-23",
    });
  });
  it("quinta → coleta sexta, retirada segunda", () => {
    expect(at("2026-10-22T10:00:00")).toEqual({
      collect: "2026-10-23",
      pickup: "2026-10-26",
    });
  });
  it("sexta → coleta sexta, retirada segunda", () => {
    expect(at("2026-10-23T10:00:00")).toEqual({
      collect: "2026-10-23",
      pickup: "2026-10-26",
    });
  });
  it("sábado → coleta segunda, retirada quarta", () => {
    expect(at("2026-10-24T10:00:00")).toEqual({
      collect: "2026-10-26",
      pickup: "2026-10-28",
    });
  });
  it("domingo → coleta segunda, retirada quarta", () => {
    expect(at("2026-10-25T10:00:00")).toEqual({
      collect: "2026-10-26",
      pickup: "2026-10-28",
    });
  });
});

describe("horário de corte (18h)", () => {
  it("17h59 ainda entra na coleta do dia; 18h00 já vai para a próxima", () => {
    expect(at("2026-10-19T17:59:00").collect).toBe("2026-10-19");
    expect(at("2026-10-19T18:00:00")).toEqual({
      collect: "2026-10-21",
      pickup: "2026-10-23",
    });
    expect(at("2026-10-19T23:59:00").collect).toBe("2026-10-21");
  });

  it("sexta depois das 18h → coleta segunda; antes → sexta", () => {
    expect(at("2026-10-23T17:00:00").collect).toBe("2026-10-23");
    expect(at("2026-10-23T19:00:00")).toEqual({
      collect: "2026-10-26",
      pickup: "2026-10-28",
    });
  });

  it("terça não muda com o corte (já seria quarta)", () => {
    expect(at("2026-10-20T08:00:00").collect).toBe("2026-10-21");
    expect(at("2026-10-20T22:00:00").collect).toBe("2026-10-21");
  });

  it("usa o horário de Brasília, não o do navegador", () => {
    // 01:30 UTC de terça = 22:30 de segunda em Brasília → depois do corte.
    expect(computeSchedule("2026-10-20T01:30:00Z")).toEqual({
      collect: "2026-10-21",
      pickup: "2026-10-23",
    });
    // 20:59 UTC de segunda = 17:59 em Brasília → ainda entra na segunda.
    expect(computeSchedule("2026-10-19T20:59:00Z").collect).toBe("2026-10-19");
  });
});

describe("feriados e exceções", () => {
  it("feriado nacional no meio: 12/10/2026 (segunda) é pulado", () => {
    // Sexta 09/10: coleta sexta; a segunda 12 é feriado → retirada quarta 14.
    expect(at("2026-10-09T10:00:00")).toEqual({
      collect: "2026-10-09",
      pickup: "2026-10-14",
    });
    // Sábado 10/10: coleta pula a segunda 12 → quarta 14, retirada sexta 16.
    expect(at("2026-10-10T10:00:00")).toEqual({
      collect: "2026-10-14",
      pickup: "2026-10-16",
    });
  });

  it("Carnaval 2026 (16 e 17/02) e Sexta-feira Santa (03/04)", () => {
    expect(at("2026-02-13T10:00:00")).toEqual({
      collect: "2026-02-13",
      pickup: "2026-02-18",
    });
    expect(at("2026-04-01T10:00:00")).toEqual({
      collect: "2026-04-01",
      pickup: "2026-04-06",
    });
  });

  it("virada de ano: 01/01 é feriado", () => {
    expect(at("2026-12-30T10:00:00")).toEqual({
      collect: "2026-12-30",
      pickup: "2027-01-04",
    });
  });

  it("dia sem operação informado pela T1", () => {
    const result = computeSchedule("2026-10-19T10:00:00-03:00", {
      closedDates: ["2026-10-19"],
    });
    expect(result).toEqual({ collect: "2026-10-21", pickup: "2026-10-23" });
  });

  it("feriados que mudam de ano: Páscoa 2026 = 05/04, 2027 = 28/03", () => {
    const h26 = holidaysOf(2026);
    expect(h26.has("2026-04-03")).toBe(true); // Sexta-feira Santa
    expect(h26.has("2026-06-04")).toBe(true); // Corpus Christi
    expect(h26.has("2026-02-16")).toBe(true); // segunda de Carnaval
    expect(holidaysOf(2027).has("2027-03-26")).toBe(true); // Sexta-feira Santa 2027
  });

  it("feriados do Rio e Consciência Negra", () => {
    const h = holidaysOf(2026);
    for (const day of ["2026-01-20", "2026-04-23", "2026-11-20", "2026-12-25"]) {
      expect(h.has(day)).toBe(true);
    }
  });
});

describe("apoio", () => {
  it("só segunda, quarta e sexta operam", () => {
    expect(
      [
        "2026-10-19",
        "2026-10-20",
        "2026-10-21",
        "2026-10-22",
        "2026-10-23",
        "2026-10-24",
        "2026-10-25",
      ].map((d) => isOperatingDay(d)),
    ).toEqual([true, false, true, false, true, false, false]);
  });

  it("datas em português", () => {
    expect(formatScheduleDate("2026-10-19")).toBe("Segunda-feira, 19/10/2026");
    expect(formatScheduleDate("2026-10-23")).toBe("Sexta-feira, 23/10/2026");
    expect(formatOrderMoment("2026-10-19T18:30:00Z")).toBe("19/10/2026 às 15:30");
  });

  it("aritmética de dias atravessa mês e ano", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-10-19")).toBe(1);
  });
});
