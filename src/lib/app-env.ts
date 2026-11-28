// Ambiente do app, definido por NEXT_PUBLIC_APP_ENV na Vercel ("production" ou "staging").
// Só "staging" muda alguma coisa: sem a variável, o app se comporta como produção (como sempre foi).
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "";
export const IS_STAGING = APP_ENV === "staging";

/** Id do projeto Supabase a partir da URL (ex.: https://abcd.supabase.co -> "abcd"). */
export function supabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url.trim());
  return m ? m[1] : null;
}
