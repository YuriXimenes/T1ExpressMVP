/** Casa o nome da loja lido no pedido com as lojas do pedido T1 (tolerante a grafia). */

const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Forma compacta: sem acento, minúsculas, só letras e números ("Já Era Hora!" → "jaerahora"). */
export const compactName = (s: string) => words(s).replace(/ /g, "");

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Semelhança 0–1 entre dois nomes de loja. */
export function storeSimilarity(readName: string, storeName: string): number {
  const a = compactName(readName);
  const b = compactName(storeName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let score = 0;
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) score = 0.9;
  score = Math.max(score, 1 - editDistance(a, b) / Math.max(a.length, b.length));
  const readTokens = new Set(
    words(readName)
      .split(" ")
      .filter((t) => t.length > 1),
  );
  const tokens = words(storeName)
    .split(" ")
    .filter((t) => t.length > 1);
  if (tokens.length && readTokens.size) {
    const common = tokens.filter((t) => readTokens.has(t)).length;
    score = Math.max(score, common / Math.max(tokens.length, readTokens.size));
  }
  return score;
}

/** É a mesma loja? (grafia diferente, acento, espaço, pontuação ou pequeno erro de leitura). */
export function sameStore(readName: string, storeName: string): boolean {
  return storeSimilarity(readName, storeName) >= 0.85;
}

/** Devolve a loja que melhor corresponde ao nome lido, ou null. */
export function matchStore<T extends { id: string; name: string }>(
  readName: string,
  stores: T[],
): T | null {
  let best: { store: T; score: number } | null = null;
  for (const store of stores) {
    const score = storeSimilarity(readName, store.name);
    if (!best || score > best.score) best = { store, score };
  }
  return best && best.score >= 0.6 ? best.store : null;
}
