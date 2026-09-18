const BACKSLASH = 92;

/**
 * `?next=` vem da URL e portanto não é confiável: só aceitamos caminhos
 * internos (evita redirecionar para outro site depois do login).
 */
export function safeNext(next?: string | null): string {
  if (!next || next[0] !== "/") return "/conta";
  // "//host" e "/\host" são interpretados pelo navegador como outro site.
  if (next[1] === "/" || next.charCodeAt(1) === BACKSLASH) return "/conta";
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    // Barra invertida e caracteres de controle (tab/quebra de linha são removidos pelo navegador).
    if (code === BACKSLASH || code < 32) return "/conta";
  }
  return next;
}
