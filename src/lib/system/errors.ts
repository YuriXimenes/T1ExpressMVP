/**
 * Monitoramento de erros próprio (0025_system.sql, `log_client_error`). Envia
 * direto para a API do Supabase com a chave pública: funciona no navegador, no
 * servidor e até quando o React quebrou. Nunca lança.
 */

export type ErrorSource = "site" | "admin" | "server";

const NOISE = [
  /^script error\.?$/i,
  /resizeobserver loop/i,
  /(chrome|moz|safari)-extension:\/\//i,
  /^cancelled$|^canceled$/i,
  /aborterror/i,
  // Navegação interrompida pelo próprio visitante e controle interno do Next.
  /destination stream closed early/i,
  /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/,
];

/** Erros sem informação ou de fora do site (extensões do navegador). */
export function shouldIgnoreError(message: string, stack?: string | null): boolean {
  const text = `${message}\n${stack ?? ""}`;
  if (!message.trim()) return true;
  return NOISE.some((re) => re.test(message) || re.test(text));
}

export function sourceForPath(path: string): ErrorSource {
  return path.startsWith("/admin") ? "admin" : "site";
}

/** Texto e pilha de qualquer coisa lançada. */
export function describeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    const digest = (err as Error & { digest?: string }).digest;
    return {
      message: `${err.name && err.name !== "Error" ? `${err.name}: ` : ""}${err.message}${digest ? ` (digest ${digest})` : ""}`,
      stack: err.stack,
    };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err).slice(0, 500) };
  } catch {
    return { message: String(err) };
  }
}

export async function reportError(input: {
  source: ErrorSource;
  message: string;
  stack?: string;
  path?: string;
  userAgent?: string;
}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || shouldIgnoreError(input.message, input.stack)) return;
  try {
    await fetch(`${url}/rest/v1/rpc/log_client_error`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        p: {
          source: input.source,
          message: input.message.slice(0, 500),
          stack: input.stack?.slice(0, 4000),
          path: input.path?.slice(0, 300),
          userAgent: input.userAgent?.slice(0, 300),
        },
      }),
      keepalive: true,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // monitoramento nunca pode derrubar nada
  }
}
