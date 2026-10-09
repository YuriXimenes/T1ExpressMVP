import { describe, expect, it, vi } from "vitest";
import { lookupCep } from "@/lib/cep-lookup";

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as Response;

describe("lookupCep", () => {
  it("devolve cidade, bairro e UF de um CEP válido", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ localidade: "Rio de Janeiro", bairro: "Tijuca", uf: "rj" }),
    );
    const info = await lookupCep("20520-054", { fetchImpl: fetchImpl as never });
    expect(info).toEqual({ city: "Rio de Janeiro", neighborhood: "Tijuca", uf: "RJ" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/20520054/json/",
      expect.anything(),
    );
  });

  it("CEP de cidade pequena (sem bairro) continua válido", async () => {
    const fetchImpl = async () => jsonResponse({ localidade: "Saquarema", uf: "RJ" });
    expect(await lookupCep("28990000", { fetchImpl: fetchImpl as never })).toEqual({
      city: "Saquarema",
      neighborhood: "",
      uf: "RJ",
    });
  });

  it("não consulta CEP com formato errado", async () => {
    const fetchImpl = vi.fn();
    expect(await lookupCep("123", { fetchImpl: fetchImpl as never })).toBeNull();
    expect(await lookupCep(undefined, { fetchImpl: fetchImpl as never })).toBeNull();
    expect(await lookupCep("", { fetchImpl: fetchImpl as never })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("CEP inexistente (erro), resposta ruim e HTTP de erro viram null", async () => {
    const run = (res: Response) =>
      lookupCep("99999999", { fetchImpl: (async () => res) as never });
    expect(await run(jsonResponse({ erro: "true" }))).toBeNull();
    expect(await run(jsonResponse({ erro: true }))).toBeNull();
    expect(await run(jsonResponse({}))).toBeNull();
    expect(await run(jsonResponse({ localidade: "  " }))).toBeNull();
    expect(await run(jsonResponse({}, false))).toBeNull();
  });

  it("rede fora do ar ou JSON quebrado viram null, sem lançar", async () => {
    const boom = async () => {
      throw new Error("offline");
    };
    expect(await lookupCep("20520054", { fetchImpl: boom as never })).toBeNull();
    const broken = async () =>
      ({
        ok: true,
        json: async () => {
          throw new Error("json");
        },
      }) as unknown as Response;
    expect(await lookupCep("20520054", { fetchImpl: broken as never })).toBeNull();
  });

  it("desiste quando demora mais que o limite", async () => {
    const slow = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("abort")));
      });
    const started = Date.now();
    expect(
      await lookupCep("20520054", { timeoutMs: 30, fetchImpl: slow as never }),
    ).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
