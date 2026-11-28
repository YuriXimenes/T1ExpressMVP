// Chave do layout novo do site público, por área (variável SITE_V2_AREAS na Vercel).
// Vazia = site exatamente como hoje. "todas" (ou "all"/"*") liga tudo.
// Ex.: SITE_V2_AREAS="home,pontos" liga só a Home e os Pontos T1.
// Voltar uma área = tirar o nome da lista e republicar (Redeploy).

export const SITE_V2_AREAS = [
  "home",
  "pontos",
  "para-lojas",
  "seguranca",
  "sobre",
  "acesso",
  "conta",
  "pedido",
  "pos-pedido",
] as const;

export type SiteV2Area = (typeof SITE_V2_AREAS)[number];

/** Página de prévia dos componentes (só no ambiente de testes). */
export const PREVIEW_PATH = "/previa-v2";

const ALL = new Set(["todas", "todos", "all", "*"]);

export function parseSiteV2Areas(raw: string | null | undefined): SiteV2Area[] {
  if (!raw) return [];
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.some((p) => ALL.has(p))) return [...SITE_V2_AREAS];
  return SITE_V2_AREAS.filter((a) => parts.includes(a));
}

/** Área do site a que um endereço pertence (null = fica sempre no layout atual). */
export function areaForPath(pathname: string): SiteV2Area | null {
  const p = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  const first = p.split("/")[1];
  switch (first) {
    case "pontos-t1":
      return "pontos";
    case "para-lojas":
      return "para-lojas";
    case "seguranca":
      return "seguranca";
    case "sobre":
      return "sobre";
    case "login":
    case "criar-conta":
    case "esqueci-senha":
    case "redefinir-senha":
      return "acesso";
    case "conta":
    case "pesquisa":
      return "conta";
    case "simular-frete":
    case "pedido":
    case "pagamento":
      return "pedido";
    case "pedidos":
      return "pos-pedido";
    default:
      // /retirada (tela da loja pelo QR), /parceiro, /convite e qualquer outra: layout atual.
      return null;
  }
}

/** O endereço usa a moldura nova? A prévia só existe no ambiente de testes. */
export function usesSiteV2(
  pathname: string,
  enabled: readonly SiteV2Area[],
  isStaging: boolean,
): boolean {
  const p = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  if (p === PREVIEW_PATH) return isStaging;
  const area = areaForPath(pathname);
  return area !== null && enabled.includes(area);
}
