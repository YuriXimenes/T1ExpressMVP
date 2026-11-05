import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  deadlineLabel,
  dueState,
  effectiveStatus,
  isBusinessDay,
} from "@/lib/occurrences/rules";
import { daysWaiting, guardState, hoursLabel } from "@/lib/points/guard";

describe("dias úteis", () => {
  it("reconhece fim de semana e feriado", () => {
    expect(isBusinessDay("2026-11-18")).toBe(true);
    expect(isBusinessDay("2026-11-14")).toBe(false); // sábado
    expect(isBusinessDay("2026-11-20")).toBe(false); // Consciência Negra
    expect(isBusinessDay("2026-02-17")).toBe(false); // Carnaval
  });

  it("3 dias úteis: mesmo horário, pulando fim de semana e feriado (igual ao banco)", () => {
    expect(addBusinessDays("2026-11-13T15:00:00-03:00", 3).toISOString()).toBe(
      new Date("2026-11-18T15:00:00-03:00").toISOString(),
    );
    expect(addBusinessDays("2026-11-19T10:00:00-03:00", 3).toISOString()).toBe(
      new Date("2026-11-25T10:00:00-03:00").toISOString(),
    );
  });
});

describe("status e prazo", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("resolvida vira encerrada depois do encerramento automático", () => {
    expect(
      effectiveStatus({ status: "resolvida", autoCloseAt: "2026-11-10T11:00:00Z" }, now),
    ).toBe("encerrada");
    expect(
      effectiveStatus({ status: "resolvida", autoCloseAt: "2026-11-11T11:00:00Z" }, now),
    ).toBe("resolvida");
    expect(effectiveStatus({ status: "aberta" }, now)).toBe("aberta");
  });

  it("prazo de resolução", () => {
    expect(dueState({ status: "aberta", dueAt: "2026-11-10T11:00:00Z" }, now)).toBe(
      "overdue",
    );
    expect(dueState({ status: "em_analise", dueAt: "2026-11-11T06:00:00Z" }, now)).toBe(
      "soon",
    );
    expect(dueState({ status: "aberta", dueAt: "2026-11-15T06:00:00Z" }, now)).toBe("ok");
    expect(
      dueState({ status: "resolvida", dueAt: "2026-11-01T06:00:00Z" }, now),
    ).toBeNull();
  });

  it("rótulo do prazo", () => {
    expect(deadlineLabel(168)).toBe("7 dias");
    expect(deadlineLabel(24)).toBe("1 dia");
    expect(deadlineLabel(36)).toBe("36 horas");
  });
});

describe("prazo de guarda", () => {
  const now = new Date("2026-11-10T15:00:00Z"); // 12h em Brasília

  it("vencido, vence hoje ou no prazo", () => {
    expect(guardState("2026-11-10T14:00:00Z", now)).toBe("expired");
    expect(guardState("2026-11-11T02:00:00Z", now)).toBe("today"); // 23h de Brasília
    expect(guardState("2026-11-12T02:00:00Z", now)).toBe("ok");
    expect(guardState(undefined, now)).toBe("ok");
  });

  it("dias de espera e tempo até a retirada", () => {
    expect(daysWaiting("2026-11-07T16:00:00Z", now)).toBe(2);
    expect(daysWaiting(undefined, now)).toBe(0);
    expect(hoursLabel(5)).toBe("5 h");
    expect(hoursLabel(30.5)).toBe("1 dia e 7 h");
    expect(hoursLabel(48)).toBe("2 dias");
    expect(hoursLabel(undefined)).toBe("—");
  });
});
