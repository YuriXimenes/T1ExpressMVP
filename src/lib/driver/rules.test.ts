import { describe, expect, it } from "vitest";
import {
  agoLabel,
  distanceMeters,
  mapTrip,
  shouldSendPosition,
  splitTodayTrips,
  stopTone,
} from "@/lib/driver/rules";

const t = (id: string, day: string, status: string) => ({ id, day, status });

describe("splitTodayTrips", () => {
  it("separa a fazer e concluídas; em andamento primeiro; atrasada marcada", () => {
    const r = splitTodayTrips(
      [
        t("a", "2026-11-06", "enviada"),
        t("b", "2026-11-06", "concluida"),
        t("c", "2026-11-06", "em_andamento"),
        t("d", "2026-11-04", "enviada"),
      ],
      "2026-11-06",
    );
    expect(r.todo.map((x) => x.id)).toEqual(["c", "d", "a"]);
    expect(r.done.map((x) => x.id)).toEqual(["b"]);
    expect(r.showSections).toBe(true);
    expect(r.isLate(r.todo[1])).toBe(true);
  });

  it("uma viagem só: sem separação", () => {
    expect(
      splitTodayTrips([t("a", "2026-11-06", "enviada")], "2026-11-06").showSections,
    ).toBe(false);
  });
});

describe("mapTrip", () => {
  it("em andamento, senão a próxima enviada", () => {
    expect(
      mapTrip([t("a", "2026-11-07", "enviada"), t("b", "2026-11-06", "em_andamento")])
        ?.id,
    ).toBe("b");
    expect(
      mapTrip([t("a", "2026-11-07", "enviada"), t("c", "2026-11-06", "enviada")])?.id,
    ).toBe("c");
    expect(mapTrip([t("a", "2026-11-06", "concluida")])).toBeUndefined();
  });
});

describe("GPS", () => {
  const p = (lat: number, lng: number, at: number, accuracy?: number) => ({
    lat,
    lng,
    at,
    accuracy,
  });

  it("distância aproximada", () => {
    expect(Math.round(distanceMeters(p(-22.9, -43.2, 0), p(-22.9009, -43.2, 0)))).toBe(
      100,
    );
  });

  it("envia a cada 30 s ou 100 m; nunca em menos de 15 s; ignora imprecisa", () => {
    expect(shouldSendPosition(null, p(-22.9, -43.2, 0))).toBe(true);
    expect(shouldSendPosition(p(-22.9, -43.2, 0), p(-22.9, -43.2, 20_000))).toBe(false);
    expect(shouldSendPosition(p(-22.9, -43.2, 0), p(-22.9, -43.2, 31_000))).toBe(true);
    expect(shouldSendPosition(p(-22.9, -43.2, 0), p(-22.902, -43.2, 16_000))).toBe(true);
    expect(shouldSendPosition(p(-22.9, -43.2, 0), p(-22.95, -43.2, 5_000))).toBe(false);
    expect(shouldSendPosition(null, p(-22.9, -43.2, 0, 500))).toBe(false);
  });
});

describe("textos", () => {
  it("situação da parada e tempo relativo", () => {
    expect(stopTone("atendida")).toBe("feita");
    expect(stopTone("nao_realizada")).toBe("falhou");
    expect(stopTone("aguardando")).toBe("pendente");
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(agoLabel("2026-11-06T11:57:00Z", now)).toBe("há 3 min");
    expect(agoLabel("2026-11-06T12:00:00Z", now)).toBe("agora");
  });
});
