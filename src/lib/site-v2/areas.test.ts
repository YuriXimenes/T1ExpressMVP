import { describe, expect, it } from "vitest";
import { SITE_V2_AREAS, areaForPath, parseSiteV2Areas, usesSiteV2 } from "./areas";

describe("parseSiteV2Areas", () => {
  it("vazia ou ausente desliga tudo (site como hoje)", () => {
    expect(parseSiteV2Areas(undefined)).toEqual([]);
    expect(parseSiteV2Areas("")).toEqual([]);
    expect(parseSiteV2Areas("  ,  ")).toEqual([]);
  });
  it("lista liga só as áreas citadas, sem diferenciar maiúsculas e espaços", () => {
    expect(parseSiteV2Areas(" Home , pontos ")).toEqual(["home", "pontos"]);
  });
  it("ignora nomes desconhecidos", () => {
    expect(parseSiteV2Areas("home,admin,loja,xyz")).toEqual(["home"]);
  });
  it("'todas' liga tudo", () => {
    expect(parseSiteV2Areas("todas")).toEqual([...SITE_V2_AREAS]);
    expect(parseSiteV2Areas("all")).toEqual([...SITE_V2_AREAS]);
  });
});

describe("areaForPath", () => {
  it.each([
    ["/", "home"],
    ["/?x=1", "home"],
    ["/pontos-t1", "pontos"],
    ["/para-lojas", "para-lojas"],
    ["/seguranca/", "seguranca"],
    ["/sobre", "sobre"],
    ["/login", "acesso"],
    ["/criar-conta", "acesso"],
    ["/esqueci-senha", "acesso"],
    ["/redefinir-senha", "acesso"],
    ["/conta", "conta"],
    ["/pesquisa", "conta"],
    ["/simular-frete", "pedido"],
    ["/pedido", "pedido"],
    ["/pagamento", "pedido"],
    ["/pedidos/abc", "pos-pedido"],
  ])("%s → %s", (path, area) => {
    expect(areaForPath(path)).toBe(area);
  });
  it.each(["/retirada/tok", "/parceiro/cadastro/x", "/convite/x", "/admin", "/loja", "/entregador", "/qualquer"])(
    "%s fica sempre no layout atual",
    (path) => {
      expect(areaForPath(path)).toBeNull();
    },
  );
});

describe("usesSiteV2", () => {
  it("chave vazia: nenhuma página muda", () => {
    for (const p of ["/", "/conta", "/pedido", "/pedidos/1"]) expect(usesSiteV2(p, [], false)).toBe(false);
  });
  it("só a área ligada muda", () => {
    expect(usesSiteV2("/", ["home"], false)).toBe(true);
    expect(usesSiteV2("/conta", ["home"], false)).toBe(false);
  });
  it("a prévia só existe no ambiente de testes", () => {
    expect(usesSiteV2("/previa-v2", [], true)).toBe(true);
    expect(usesSiteV2("/previa-v2", [...SITE_V2_AREAS], false)).toBe(false);
  });
});
