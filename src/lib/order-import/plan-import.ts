import type { GameTag } from "@/lib/types/signup";
import type { CardLikeItem, PedidoGroup } from "@/lib/types/order";
import { compactName } from "./match-store";
import type { ImportedItem } from "./parse-order";
import { importedToGroup, isBlankGroup } from "./to-groups";

/** Um bloco conferido pelo cliente: para qual loja vai, nº do pedido e cartas. */
export interface ReviewedBlock {
  storeId: string;
  orderNumber: string;
  items: ImportedItem[];
}

export interface PlannedLot {
  storeId: string;
  orderNumber: string;
  /** append: entra no lote já aberto com o mesmo nº; new: abre lote novo. */
  action: "append" | "new";
  /** Lote existente (quando append). */
  targetGroupId?: string;
  /** Cartas que serão incluídas. */
  items: ImportedItem[];
  /** Cartas que já estão no lote (mesmo nome e preço): não entram, a menos que o cliente marque. */
  duplicates: ImportedItem[];
}

/** Nº do pedido comparado só pelos dígitos ("#12523369" = "12523369"). */
export function normalizeOrderNumber(n: string): string {
  const digits = n.replace(/\D/g, "");
  return digits || n.trim().toLowerCase();
}

const cardKey = (name: string, price: number) =>
  `${compactName(name.replace(/\(foil\)/i, "foil"))}|${Math.round(price * 100)}`;

function findLot(groups: PedidoGroup[], orderNumber: string): PedidoGroup | undefined {
  if (!orderNumber) return undefined;
  const key = normalizeOrderNumber(orderNumber);
  return groups.find(
    (g) =>
      g.kind !== "acessorios" &&
      !isBlankGroup(g) &&
      g.orderNumber.trim() &&
      normalizeOrderNumber(g.orderNumber) === key,
  );
}

/** Decide o que fazer com cada bloco, sem alterar nada. */
export function planImport(
  current: Record<string, PedidoGroup[]>,
  blocks: ReviewedBlock[],
): PlannedLot[] {
  // Junta blocos da mesma loja e mesmo nº (prints em partes na mesma importação).
  const merged: ReviewedBlock[] = [];
  for (const b of blocks) {
    const num = b.orderNumber.trim();
    const same = num
      ? merged.find(
          (m) =>
            m.storeId === b.storeId &&
            m.orderNumber.trim() &&
            normalizeOrderNumber(m.orderNumber) === normalizeOrderNumber(num),
        )
      : undefined;
    if (same) same.items = [...same.items, ...b.items];
    else merged.push({ ...b, orderNumber: num, items: [...b.items] });
  }

  return merged.map((b) => {
    const lot = findLot(current[b.storeId] ?? [], b.orderNumber);
    const existing = new Set(
      (lot?.cardItems ?? []).map((c: CardLikeItem) =>
        cardKey(
          c.cardName,
          c.priceMode === "total" ? c.price / Math.max(1, c.quantity) : c.price,
        ),
      ),
    );
    const items: ImportedItem[] = [];
    const duplicates: ImportedItem[] = [];
    const seen = new Set<string>();
    for (const item of b.items) {
      const key = cardKey(item.name, item.unitPrice);
      if (existing.has(key) || seen.has(key)) duplicates.push(item);
      else items.push(item);
      seen.add(key);
    }
    return {
      storeId: b.storeId,
      orderNumber: b.orderNumber,
      action: lot ? "append" : "new",
      targetGroupId: lot?.id,
      items,
      duplicates,
    } satisfies PlannedLot;
  });
}

/** Aplica o plano: devolve os lotes de cada loja afetada (as demais ficam iguais). */
export function applyImportPlan(
  current: Record<string, PedidoGroup[]>,
  plan: PlannedLot[],
  game: GameTag,
  includeDuplicates = false,
): Record<string, PedidoGroup[]> {
  const next: Record<string, PedidoGroup[]> = {};
  for (const lot of plan) {
    const items = includeDuplicates ? [...lot.items, ...lot.duplicates] : lot.items;
    if (!items.length) continue;
    const groups = next[lot.storeId] ?? current[lot.storeId] ?? [];
    const created = importedToGroup(items, lot.orderNumber, game);
    if (lot.action === "append" && lot.targetGroupId) {
      next[lot.storeId] = groups.map((g) =>
        g.id === lot.targetGroupId
          ? {
              ...g,
              // Lote só com uma linha vazia: troca pelas importadas.
              cardItems: [
                ...g.cardItems.filter((c) => c.cardName.trim() || c.price),
                ...created.cardItems,
              ],
            }
          : g,
      );
    } else {
      next[lot.storeId] = [...groups.filter((g) => !isBlankGroup(g)), created];
    }
  }
  return next;
}
