import { STAFF_AREAS } from "@/lib/admin/access";

/** Textos e links da Auditoria (0025_system.sql, `audit_log`). */

export type AuditAction = "criou" | "alterou" | "excluiu";

export const ACTION_LABELS: Record<AuditAction, string> = {
  criou: "Criou",
  alterou: "Alterou",
  excluiu: "Excluiu",
};

export const TABLE_LABELS: Record<string, string> = {
  stores: "Loja",
  freight_routes: "Rota do comparador",
  carrier_flat_rates: "Preço fixo de transportadora",
  comparison_carriers: "Comparativo: transportadora",
  comparison_rows: "Comparativo: linha",
  comparison_values: "Comparativo: valor",
  coupons: "Cupom",
  pricing_versions: "Preço",
  orders: "Pedido",
  store_charges: "Cobrança de loja extra",
  order_item_checks: "Conferência",
  order_photos: "Foto do pedido",
  custody_events: "Custódia",
  order_pickups: "Retirada",
  support_tickets: "Chamado",
  partner_leads: "Interessado em parceria",
  store_suggestions: "Sugestão de loja",
  admins: "Acesso ao admin",
  staff_roles: "Perfil",
  staff_role_permissions: "Permissão do perfil",
  staff_invites: "Convite da equipe",
  team_members: "Pessoa da equipe",
  team_pay_rules: "Remuneração",
  vehicles: "Veículo",
  fuel_prices: "Preço do combustível",
  ops_settings: "Configurações da operação",
  store_closures: "Loja fechada",
  trips: "Viagem",
  routes: "Rota",
  route_stops: "Parada",
  route_stop_orders: "Pedido na parada",
  occurrence_types: "Tipo de ocorrência",
  occurrences: "Ocorrência",
  occurrence_resolutions: "Resolução de ocorrência",
  occurrence_attachments: "Anexo de ocorrência",
  store_partner_profiles: "Ficha do parceiro",
  partner_onboardings: "Cadastro de parceiro",
  partner_documents: "Documento do parceiro",
  store_members: "Acesso da loja",
  store_invites: "Convite da loja",
  store_pay_rules: "Remuneração da loja",
  store_payouts: "Pagamento à loja",
  team_adjustments: "Avulso da equipe",
  team_payouts: "Pagamento à equipe",
  customer_refunds: "Reembolso",
  expense_categories: "Categoria de despesa",
  expenses: "Despesa",
  expense_files: "Anexo de despesa",
  claims: "Sinistro",
  customer_credits: "Crédito do cliente",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Situação",
  active: "Ativo",
  name: "Nome",
  label: "Rótulo",
  code: "Código",
  type: "Tipo",
  kind: "Tipo",
  value: "Valor",
  amount_brl: "Valor",
  description: "Descrição",
  note: "Observação",
  notes: "Observações",
  reason: "Motivo",
  delivery_stage: "Etapa",
  cancel_reason: "Motivo do cancelamento",
  published: "Publicada no site",
  is_pickup_point: "Ponto de retirada",
  email: "E-mail",
  phone: "Telefone",
  pix_key: "Chave Pix",
  document: "Documento",
  area: "Área",
  role_id: "Perfil",
  can_view: "Pode ver",
  can_create: "Pode criar",
  can_edit: "Pode editar",
  can_delete: "Pode excluir",
  valid_from: "Vale de",
  valid_until: "Vale até",
  max_uses: "Usos no total",
  max_uses_per_user: "Usos por cliente",
  min_order_brl: "Frete mínimo",
  first_purchase_only: "Só 1ª compra",
  base_brl: "1ª loja",
  extra_store_brl: "Loja adicional",
  added_store_brl: "Loja em pedido aberto",
  insurance_per_100_brl: "Seguro a cada R$ 100",
  effective_from: "Vale a partir de",
  loggi_brl: "Loggi",
  uber_brl: "Uber",
  flat_rate_brl: "Preço fixo",
  approved_amount: "Valor aprovado",
  suggested_amount: "Valor sugerido",
  declared_amount: "Valor declarado",
  coverage_brl: "Cobertura",
  paid_at: "Pago em",
  due_at: "Prazo",
  due_date: "Vencimento",
  competence: "Competência",
  category_id: "Categoria",
  receipt_path: "Comprovante",
  resolved: "Resolvido",
  contacted: "Contatado",
  month: "Mês",
  day: "Dia",
  member_id: "Pessoa",
  store_id: "Loja",
  order_id: "Pedido",
  user_id: "Usuário",
  assignee_id: "Responsável",
  guard_days: "Dias de guarda",
  pickup_hours: "Horário de retirada",
  pickup_capacity: "Capacidade",
  guard_until: "Guardar até",
  price_brl: "Preço",
  credit_used_brl: "Crédito usado",
  amount_due_brl: "Total a pagar",
};

/** Nome do campo em português (sem tradução: "minha_coluna" → "Minha coluna"). */
export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const text = key.replace(/_brl$/, "").replace(/_id$/, "").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Valor legível para a tela e o CSV. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "vazio";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) return value.split("-").reverse().join("/");
    if (ISO_TIME.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime()))
        return d.toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          dateStyle: "short",
          timeStyle: "short",
        });
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(formatAuditValue).join(", ") || "vazio";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Link para a tela do registro (ou da área, quando não há tela própria). */
export function recordHref(table: string, recordId: string | undefined, area: string) {
  if (recordId && /^[0-9a-f-]{36}$/.test(recordId)) {
    switch (table) {
      case "orders":
      case "order_pickups":
        return `/admin/pedidos/${recordId}`;
      case "occurrences":
        return `/admin/pedidos/ocorrencias/${recordId}`;
      case "claims":
        return `/admin/financeiro/sinistros/${recordId}`;
      case "partner_onboardings":
        return `/admin/parceiros/kyc/${recordId}`;
    }
  }
  return STAFF_AREAS.find((a) => a.id === area)?.hrefs[0];
}

export function areaLabel(area: string): string {
  return STAFF_AREAS.find((a) => a.id === area)?.label ?? area;
}
