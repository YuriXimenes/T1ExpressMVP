/** Bucket do Supabase Storage com os logos enviados pelo admin. */
export const STORE_LOGO_BUCKET = "store-logos";

/** Exibido quando a loja não tem logo (ou tem um caminho inválido). */
export const FALLBACK_STORE_LOGO = "/logos/sem-logo.svg";

/**
 * Só aceita o que o `next/image` sabe exibir: um arquivo de `public/logos` ou
 * uma URL pública do bucket de logos deste projeto. Qualquer outra coisa (um
 * caminho do computador, `C:\...`, uma URL de outro site) quebraria a página.
 */
export function isValidStoreLogo(path: string | null | undefined): path is string {
  if (!path) return false;
  if (/^\/logos\/[\w.-]+$/.test(path)) return true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  const prefix = `${base.replace(/\/$/, "")}/storage/v1/object/public/${STORE_LOGO_BUCKET}/`;
  return path.startsWith(prefix) && /^[\w./-]+$/.test(path.slice(prefix.length));
}
