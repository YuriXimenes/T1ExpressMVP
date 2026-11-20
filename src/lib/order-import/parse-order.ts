/**
 * Lê o texto de um pedido (colado da página da Liga ou extraído de um print por OCR)
 * e devolve as lojas com nº do pedido, cartas, quantidades e valores.
 *
 * Função pura: não sabe de onde veio o texto. Tolera erros típicos de OCR
 * ("RS" no lugar de "R$", "unig" no lugar de "unid", vírgula trocada por ponto,
 * lixo antes do nome da carta vindo de imagens e ícones).
 */

export interface ImportedItem {
  name: string;
  quantity: number;
  /** Preço por unidade já com desconto (o riscado é ignorado). */
  unitPrice: number;
  total: number;
  foil: boolean;
  /** A leitura não fechou (valores incoerentes ou faltando): pedir conferência. */
  doubtful: boolean;
}

export interface ImportedStore {
  /** Nome da loja como apareceu no pedido (vazio se não deu para ler). */
  name: string;
  orderNumber?: string;
  items: ImportedItem[];
  /** Total da loja informado no pedido (para conferir a soma dos itens). */
  storeTotal?: number;
}

export interface ImportResult {
  stores: ImportedStore[];
}

const MONEY_RE = /R\s?[$S5§]\s*:?\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+[.,]\d{2}(?!\d)|\d+)/gi;
const QTY_RE = /(?:^|\s)(\d{1,4})\s*(?:unid|unig|uniq|und|un\.|unidades?)\b/i;
const ORDER_NO_RE = /#?\(?\s*(\d{7,10})\s*\)?/;

/** Valor em reais a partir do texto de um preço (sem o "R$"). */
export function parseMoneyValue(raw: string): { value: number; exact: boolean } {
  const s = raw.trim();
  if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(s)) {
    return { value: Number(s.replace(/\./g, "").replace(",", ".")), exact: true };
  }
  if (/^\d+[.,]\d{2}$/.test(s))
    return { value: Number(s.replace(",", ".")), exact: true };
  // Sem separador (OCR comeu a vírgula): "225" provavelmente é 2,25.
  if (/^\d{3,}$/.test(s)) return { value: Number(s) / 100, exact: false };
  return { value: Number(s), exact: false };
}

function moneysIn(line: string): { value: number; exact: boolean }[] {
  return [...line.matchAll(MONEY_RE)].map((m) => parseMoneyValue(m[1]));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Linhas de cabeçalho, resumo e etiquetas que nunca são nome de carta. */
function isMetaLine(line: string): boolean {
  const n = norm(line)
    .replace(/[^a-z0-9$ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return true;
  // Linha com o nº do pedido (cabeçalho da loja) nunca é nome de carta.
  if (/#\s*\d{6,10}/.test(line)) return true;
  if (
    /^(card|carta|quantidade|r\$? ?unit|r\$? ?total|valor|status|frete|itens?|total)\b/.test(
      n,
    )
  )
    return true;
  if (
    /(aguardando|retirada no balcao|forma de envio|rastreio|visualizar|vendido e entregue|valor total|total a pagar|taxa de servico|forma de pagamento|chave pix|endereco de entrega|pagamento via)/.test(
      n,
    )
  )
    return true;
  // Etiquetas soltas: idioma, condição, foil.
  if (/^(en|pt|es|jp|de|fr|it|nm|sp|mp|hp|d|m|foil)( (en|pt|nm|sp|mp|hp|foil))*$/.test(n))
    return true;
  return false;
}

/** Palavras curtas que começam nomes de cartas de verdade (não descartar). */
const SHORT_NAME_WORDS = new Set([
  "ob",
  "ow",
  "xu",
  "yu",
  "ur",
  "ox",
  "o",
  "a",
  "el",
  "la",
  "le",
  "de",
  "da",
  "do",
  "mr",
  "dr",
  "st",
  "ex",
  "gx",
  "v",
  "z",
  "j",
  "jo",
  "ka",
  "ki",
  "no",
  "go",
  "ho",
  "in",
  "of",
  "on",
  "up",
  "us",
  "we",
  "to",
]);

/** Tira o lixo que o OCR põe antes do nome (ícones, imagem da carta). */
export function cleanCardName(line: string): string {
  let tokens = line
    .replace(/R\s?[$S5§]\s*:?\s*[\d.,]+/gi, " ")
    .trim()
    .split(/\s+/);
  const garbage = (t: string) =>
    /^[^A-Za-zÀ-ÿ0-9]+$/.test(t) || /[\][|=_~—«»“”]/.test(t) || /^[A-Z]{1,2}\]?$/.test(t);
  // "|" (borda da imagem da carta) nunca faz parte do nome: corta tudo antes dele.
  const before = tokens.length;
  const bar = tokens.slice(0, 4).findLastIndex((t) => /^[|\][=_~—«»]+$/.test(t));
  if (bar >= 0 && bar < tokens.length - 1) tokens = tokens.slice(bar + 1);
  while (tokens.length > 1 && garbage(tokens[0])) tokens = tokens.slice(1);
  const strippedScrap = tokens.length < before;
  if (strippedScrap) {
    // O resto da imagem já saiu ("ZE] sagu Wildling"): a palavra seguinte é o nome,
    // só que o OCR leu a maiúscula como minúscula.
    tokens[0] = tokens[0].charAt(0).toUpperCase() + tokens[0].slice(1);
  } else {
    // Palavra minúscula inventada pelo OCR a partir da imagem ("edital Spider-Man"):
    // nomes de cartas começam com maiúscula.
    while (
      tokens.length > 1 &&
      /^[a-zà-ÿ]+$/.test(tokens[0]) &&
      /^[A-ZÀ-Ý]/.test(tokens[1])
    )
      tokens = tokens.slice(1);
  }
  // Resto de ícone lido como 1–2 letras ("Al Spider-Man"), exceto nomes reais curtos.
  if (
    tokens.length > 1 &&
    tokens[0].length <= 2 &&
    !SHORT_NAME_WORDS.has(tokens[0].toLowerCase()) &&
    /^[A-ZÀ-Ý0-9]/.test(tokens[1]) &&
    tokens[1].length >= 3
  )
    tokens = tokens.slice(1);
  while (tokens.length > 1 && /^[^A-Za-zÀ-ÿ0-9)]+$/.test(tokens[tokens.length - 1]))
    tokens = tokens.slice(0, -1);
  return tokens
    .join(" ")
    .replace(/^[^A-Za-zÀ-ÿ0-9]+/, "")
    .trim();
}

/** Linha de edição/idioma/condição abaixo do nome ("Marvel's Spider-Man Inglês EN NM"). */
function isEditionLine(line: string): boolean {
  if (
    /\b(ingl[eê]s|portugu[eê]s|japon[eê]s|espanhol|alem[aã]o|franc[eê]s|italiano|chin[eê]s|coreano|russo)(?![a-zà-ÿ])/i.test(
      line,
    )
  )
    return true;
  return /\b(EN|PT|JP|ES|DE|FR|IT|CN|KR|RU)\s+(NM|SP|MP|HP|D|M)\s*$/.test(line);
}

/** Nome da loja numa linha "Nome[Loja Verificada …] #12345678" (texto colado). */
function inlineStoreName(line: string): string | null {
  const m = line.match(/^(.+?)\s*#\s*\d{6,10}\s*$/);
  if (!m) return null;
  const name = m[1]
    .replace(/\s*Loja Verificada.*$/i, "")
    .replace(/\s*-\s*Possui loja.*$/i, "")
    // Selo de verificada lido como "®", "©", "v" etc. e o ":" do layout do celular.
    .replace(/(\s+[^\sA-Za-zÀ-ÿ0-9]{1,2})?[\s:;.,]*$/, "")
    .trim();
  if (!name || isMetaLine(name) || moneysIn(name).length) return null;
  return name;
}

/** Tem ao menos uma palavra de verdade ("Spider-Man", "Opt"), não só letras soltas/siglas. */
/**
 * Quanto a linha parece nome de carta: letras das palavras de verdade
 * ("Spider-Man" conta, "EEN", "gov" e letras soltas não).
 */
function nameScore(name: string): number {
  let score = 0;
  for (const token of name.split(/\s+/)) {
    for (const part of token.split(/[-/]/)) {
      const w = part.replace(/[^A-Za-zÀ-ÿ'’]/g, "");
      if (/^[A-ZÀ-Ý][a-zà-ÿ'’]{2,}$/.test(w)) score += w.length;
    }
  }
  return score;
}

function looksLikeName(line: string): boolean {
  if (isMetaLine(line) || moneysIn(line).length || QTY_RE.test(line)) return false;
  const letters = (line.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  return letters >= 3;
}

/** Cabeçalho da loja: "Nome Valor Status Forma de Envio ..." (uma linha, comum no OCR). */
function headerName(line: string): string | null {
  const m = line.match(/^(.*?)\s+Valor\b.*\b(Status|Forma de Envio)\b/i);
  if (!m) return null;
  const tokens = m[1].trim().split(/\s+/);
  while (tokens.length > 1 && tokens[tokens.length - 1].length <= 1) tokens.pop();
  return tokens.join(" ").trim() || null;
}

interface RawItem {
  name: string;
  quantity: number;
  monies: { value: number; exact: boolean }[];
  foil: boolean;
}

function finishItem(raw: RawItem): ImportedItem {
  const q = raw.quantity;
  const m = raw.monies;
  let unit = 0;
  let total = 0;
  let doubtful = false;
  if (m.length >= 2) {
    unit = m[m.length - 2].value;
    total = m[m.length - 1].value;
    if (!m[m.length - 2].exact || !m[m.length - 1].exact) doubtful = true;
  } else if (m.length === 1) {
    unit = m[0].value;
    total = unit * q;
    if (q > 1 || !m[0].exact) doubtful = true;
  } else {
    doubtful = true;
  }
  const expected = Math.round(unit * q * 100) / 100;
  if (Math.abs(expected - total) > 0.011) {
    // OCR comeu a vírgula do total (2,25 → 225) ou leu errado: confia no unitário.
    if (unit > 0) {
      total = expected;
      doubtful = true;
    } else if (total > 0) {
      unit = Math.round((total / q) * 100) / 100;
      doubtful = true;
    }
  }
  const name = raw.foil && !/\bfoil\b/i.test(raw.name) ? `${raw.name} (Foil)` : raw.name;
  return {
    name,
    quantity: q,
    unitPrice: Math.round(unit * 100) / 100,
    total: Math.round(total * 100) / 100,
    foil: raw.foil,
    doubtful: doubtful || !name,
  };
}

function parseBlock(lines: string[], name: string): ImportedStore {
  const store: ImportedStore = { name, items: [] };
  // Nº do pedido: logo depois do cabeçalho da loja.
  for (const line of lines.slice(0, 4)) {
    if (/\d{2}\/\d{2}\/\d{4}/.test(line)) continue;
    const m = line.match(ORDER_NO_RE);
    if (m && !/R\s?[$S5§]/i.test(line.slice(0, m.index ?? 0).slice(-4))) {
      store.orderNumber = m[1];
      break;
    }
  }
  const tableStart = lines.findIndex((l) => /quantidade/i.test(l));
  const body = tableStart >= 0 ? lines.slice(tableStart + 1) : lines;

  let pendingName = "";
  let pendingFoil = false;
  // Rótulos de resumo sem valor na linha ("Total:", "Frete:", "Valor Total:"):
  // no texto colado os valores vêm depois, na mesma ordem.
  const pendingLabels: string[] = [];
  let current: RawItem | null = null;
  const close = () => {
    if (current) store.items.push(finishItem(current));
    current = null;
  };

  for (const line of body) {
    const n = norm(line);
    if (/\btotal\s*:?\s*r/.test(n) && !/valor total|total a pagar/.test(n)) {
      close();
      const v = moneysIn(line).pop();
      if (v) store.storeTotal = v.value;
      continue;
    }
    if (/valor total/.test(n)) {
      close();
      const v = moneysIn(line).pop();
      if (v && store.storeTotal === undefined) store.storeTotal = v.value;
      continue;
    }
    const label = n.replace(/[^a-z ]/g, "").trim();
    if (/^(total|frete|valor total)$/.test(label) && !moneysIn(line).length) {
      close();
      pendingLabels.push(label);
      continue;
    }
    if (/^\d+\s+itens?\s*$/i.test(line)) {
      close();
      continue;
    }
    if (!current && pendingLabels.length && moneysIn(line).length) {
      for (const value of moneysIn(line)) {
        const which = pendingLabels.shift();
        if (which === "total") store.storeTotal = value.value;
        if (which === "valor total" && store.storeTotal === undefined)
          store.storeTotal = value.value;
      }
      continue;
    }
    if (/^\s*frete\b/.test(n)) continue;
    if (isEditionLine(line) && !moneysIn(line).length) {
      if (/\bfoil\b/i.test(line)) {
        if (current) (current as RawItem).foil = true;
        else pendingFoil = true;
      }
      continue;
    }
    if (/\bfoil\b/i.test(line) && !current) pendingFoil = true;

    const qty = line.match(QTY_RE);
    if (qty) {
      close();
      current = {
        name: pendingName,
        quantity: Math.max(1, Number(qty[1])),
        monies: moneysIn(line),
        foil: pendingFoil,
      };
      pendingName = "";
      pendingFoil = false;
      continue;
    }
    const monies = moneysIn(line);
    if (monies.length && current) {
      (current as RawItem).monies.push(...monies);
      if (/\bfoil\b/i.test(line)) (current as RawItem).foil = true;
      continue;
    }
    if (looksLikeName(line)) {
      close();
      // Entre um item e o próximo podem aparecer várias linhas "com letras": o nome e a
      // linha de ícones (idioma, condição, foil) que o OCR lê como lixo ("€ EEN gov").
      // Fica a que mais parece nome; em empate, a primeira (o nome vem antes dos ícones).
      const candidate = cleanCardName(line);
      if (!pendingName || nameScore(candidate) > nameScore(pendingName))
        pendingName = candidate;
      if (/\bfoil\b/i.test(line)) pendingFoil = true;
    }
  }
  close();
  return store;
}

// ── Layout "2x Nome / Nome em inglês (Código: …)" ───────────────────────────────
// Página de pedido das lojas (tema escuro): "10 ITENS - PEDIDO #12504012", cada carta
// com "R$ 1,13 (unid.)" e "R$ 2,26 (subtotal)", resumo com "Valor dos Itens".

const QTY_PREFIX_RE =
  /^[^A-Za-zÀ-ÿ0-9]{0,4}(?:[A-Za-zÀ-ÿ®©]{1,2}[,.]?\s+)?(\d{1,3})\s*[xX×]\s+(.+)$/;
const MONEY_BEFORE = (label: string) =>
  new RegExp(`R\\s?[$S5§]\\s*:?\\s*([\\d.,]+)\\s*\\(\\s*${label}`, "i");

function isQtyPrefixLayout(lines: string[]): boolean {
  const items = lines.filter((l) => QTY_PREFIX_RE.test(l)).length;
  const priced = lines.some((l) => /\((unid|subtotal)/i.test(l));
  return items > 0 && priced;
}

/** Nome da carta: o primeiro nome da linha (antes da " / " com o nome no outro idioma). */
function qtyPrefixName(raw: string): string {
  return raw
    .split(/\s+\/\s+/)[0]
    .replace(/\(\s*c[oó]digo.*$/i, "")
    .trim();
}

function parseQtyPrefixLayout(lines: string[]): ImportedStore[] {
  const store: ImportedStore = { name: "", items: [] };
  for (const line of lines) {
    const m = line.match(/pedido\s*#?\s*(\d{6,10})/i) ?? line.match(/#\s*(\d{6,10})/);
    if (m) {
      store.orderNumber = m[1];
      break;
    }
  }
  // Nome da loja, quando aparece ("Vendido por …", "Loja: …").
  for (const line of lines) {
    const m = line.match(/^(?:vendido(?: e entregue)? por|loja)\s*:?\s+(.{3,})$/i);
    if (m) {
      store.name = m[1].trim();
      break;
    }
  }

  let cur: { name: string; quantity: number; unit?: number; total?: number } | null =
    null;
  const close = () => {
    if (!cur) return;
    const q = cur.quantity;
    let unit = cur.unit ?? 0;
    let total = cur.total ?? 0;
    let doubtful = false;
    if (!unit && total) {
      unit = Math.round((total / q) * 100) / 100;
      doubtful = true;
    }
    if (!total && unit) {
      total = Math.round(unit * q * 100) / 100;
      if (q > 1) doubtful = true;
    }
    // Tolerância de 1 centavo por unidade (arredondamento da loja: 2 × 1,13 = 2,26).
    if (unit && Math.abs(unit * q - total) > 0.011 * q) doubtful = true;
    store.items.push({
      name: cur.name,
      quantity: q,
      unitPrice: Math.round(unit * 100) / 100,
      total: Math.round(total * 100) / 100,
      foil: /\bfoil\b/i.test(cur.name),
      doubtful: doubtful || !unit || !cur.name,
    });
    cur = null;
  };

  for (const line of lines) {
    const n = norm(line);
    if (/valor dos itens/.test(n)) {
      close();
      const v = moneysIn(line).pop();
      if (v) store.storeTotal = v.value;
      continue;
    }
    if (
      /^(frete|credito|valor total|desconto|total)\b/.test(
        n.replace(/[^a-z ]/g, "").trim(),
      )
    ) {
      close();
      if (store.storeTotal === undefined && /^total\b/.test(n)) {
        const v = moneysIn(line).pop();
        if (v) store.storeTotal = v.value;
      }
      continue;
    }
    const item = line.match(QTY_PREFIX_RE);
    if (item && !/\((unid|subtotal)/i.test(line)) {
      close();
      cur = { name: qtyPrefixName(item[2]), quantity: Math.max(1, Number(item[1])) };
      continue;
    }
    if (!cur) continue;
    const u = line.match(MONEY_BEFORE("unid"));
    if (u) cur.unit = parseMoneyValue(u[1]).value;
    const t = line.match(MONEY_BEFORE("subtotal"));
    if (t) cur.total = parseMoneyValue(t[1]).value;
  }
  close();
  return store.items.length ? [store] : [];
}

/** Lê o texto inteiro do pedido (uma ou várias lojas). */
export function parseOrderText(text: string): ImportResult {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (isQtyPrefixLayout(lines)) return { stores: parseQtyPrefixLayout(lines) };

  // Onde começa cada loja: linha de cabeçalho (OCR) ou nome seguido de "#número" (texto colado).
  const starts: { index: number; name: string }[] = [];
  lines.forEach((line, i) => {
    const h = headerName(line);
    if (h) {
      starts.push({ index: i, name: h });
      return;
    }
    const inline = inlineStoreName(line);
    if (inline) {
      starts.push({ index: i, name: inline });
      return;
    }
    if (/^#\s*\d{6,10}$/.test(line) && i > 0 && !starts.some((s) => s.index === i - 1)) {
      const prev = lines[i - 1];
      if (!isMetaLine(prev) && !moneysIn(prev).length)
        starts.push({ index: i - 1, name: prev });
    }
  });

  if (starts.length === 0) {
    const store = parseBlock(lines, "");
    return { stores: store.items.length ? [store] : [] };
  }
  const stores = starts
    .map((s, k) =>
      parseBlock(lines.slice(s.index, starts[k + 1]?.index ?? lines.length), s.name),
    )
    .filter((s) => s.items.length > 0);
  return { stores };
}

/** Soma dos itens e se bate com o total da loja informado no pedido. */
export function checkStoreTotal(store: ImportedStore): {
  sum: number;
  matches: boolean | null;
} {
  const sum = Math.round(store.items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  if (store.storeTotal === undefined) return { sum, matches: null };
  return { sum, matches: Math.abs(sum - store.storeTotal) < 0.011 };
}
