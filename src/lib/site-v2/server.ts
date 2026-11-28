import { parseSiteV2Areas, type SiteV2Area } from "@/lib/site-v2/areas";

/** Áreas ligadas (lido no servidor; muda com Redeploy na Vercel). */
export function getSiteV2Areas(): SiteV2Area[] {
  return parseSiteV2Areas(process.env.SITE_V2_AREAS);
}

/** Usado pelas páginas para escolher entre o conteúdo atual e o novo. */
export function isSiteV2Enabled(area: SiteV2Area): boolean {
  return getSiteV2Areas().includes(area);
}
