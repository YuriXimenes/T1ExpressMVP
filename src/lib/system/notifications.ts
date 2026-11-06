/** Sino do admin (0025_system.sql, `admin_notifications`). */

export type NotificationCategory = "operacao" | "financeiro" | "parceiros" | "clientes";
export type NotificationSeverity = "alta" | "media" | "info";

export interface AdminNotification {
  key: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  detail?: string;
  href: string;
  at: string;
  read: boolean;
}

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  operacao: "Operação",
  financeiro: "Financeiro",
  parceiros: "Parceiros e formulários",
  clientes: "Clientes e plataforma",
};

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  alta: 0,
  media: 1,
  info: 2,
};
const CATEGORY_ORDER: NotificationCategory[] = [
  "operacao",
  "financeiro",
  "parceiros",
  "clientes",
];

/**
 * Agrupa por categoria; dentro dela, não lidos primeiro, depois o mais urgente e
 * o mais recente. Categorias com algo urgente não lido sobem.
 */
export function groupNotifications(items: AdminNotification[]) {
  const sorted = [...items].sort(
    (a, b) =>
      Number(a.read) - Number(b.read) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.at.localeCompare(a.at),
  );
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: sorted.filter((i) => i.category === category),
  }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => {
      const urgent = (g: typeof a) =>
        g.items.some((i) => !i.read && i.severity === "alta") ? 0 : 1;
      return urgent(a) - urgent(b);
    });
}
