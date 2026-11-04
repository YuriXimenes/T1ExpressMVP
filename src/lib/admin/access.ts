import { formatBRL } from "@/components/shared/price";
import { activeNavItem } from "@/components/admin/shell/nav";

/**
 * Perfis e permissões do backoffice (0016_staff_access.sql). As áreas são as
 * mesmas de `_staff_areas()` no banco: mudar aqui = mudar lá.
 */
export type StaffArea =
  | "dashboard"
  | "pedidos"
  | "chamados"
  | "coletas"
  | "pontos"
  | "ocorrencias"
  | "lojas"
  | "kyc"
  | "formularios"
  | "desempenho"
  | "precos"
  | "cupons"
  | "despesas"
  | "repasses"
  | "sinistros"
  | "usuarios"
  | "pesquisa"
  | "comparador"
  | "comparativo"
  | "pessoas"
  | "auditoria"
  | "integracoes";

export type StaffAction = "view" | "create" | "edit" | "delete";

export const STAFF_ACTIONS: { id: StaffAction; label: string }[] = [
  { id: "view", label: "Ver" },
  { id: "create", label: "Criar" },
  { id: "edit", label: "Editar" },
  { id: "delete", label: "Excluir" },
];

/** Áreas na ordem do menu, com as telas de cada uma. */
export const STAFF_AREAS: {
  id: StaffArea;
  label: string;
  group: string;
  hrefs: string[];
}[] = [
  { id: "dashboard", label: "Dashboard", group: "Visão geral", hrefs: ["/admin"] },
  {
    id: "pedidos",
    label: "Pedidos, Histórico e Atividades",
    group: "Gestão de pedidos",
    hrefs: ["/admin/pedidos", "/admin/pedidos/historico", "/admin/pedidos/atividades"],
  },
  { id: "chamados", label: "Chamados de suporte", group: "Gestão de pedidos", hrefs: [] },
  {
    id: "coletas",
    label: "Coletas e rotas",
    group: "Gestão de pedidos",
    hrefs: ["/admin/pedidos/coletas", "/admin/pedidos/rotas", "/admin/pedidos/veiculos"],
  },
  {
    id: "pontos",
    label: "Pontos de retirada",
    group: "Gestão de pedidos",
    hrefs: ["/admin/pedidos/pontos"],
  },
  {
    id: "ocorrencias",
    label: "Ocorrências",
    group: "Gestão de pedidos",
    hrefs: ["/admin/pedidos/ocorrencias"],
  },
  { id: "lojas", label: "Lojas", group: "Parceiros", hrefs: ["/admin/parceiros/lojas"] },
  {
    id: "kyc",
    label: "KYC / Onboarding",
    group: "Parceiros",
    hrefs: ["/admin/parceiros/kyc"],
  },
  {
    id: "formularios",
    label: "Formulários",
    group: "Parceiros",
    hrefs: ["/admin/formularios"],
  },
  {
    id: "desempenho",
    label: "Desempenho",
    group: "Parceiros",
    hrefs: ["/admin/parceiros/desempenho"],
  },
  {
    id: "precos",
    label: "Preços",
    group: "Financeiro",
    hrefs: ["/admin/financeiro/precos"],
  },
  {
    id: "cupons",
    label: "Cupons",
    group: "Financeiro",
    hrefs: ["/admin/financeiro/cupons"],
  },
  {
    id: "despesas",
    label: "Despesas",
    group: "Financeiro",
    hrefs: ["/admin/financeiro/despesas"],
  },
  {
    id: "repasses",
    label: "Repasses e pagamentos",
    group: "Financeiro",
    hrefs: ["/admin/financeiro/repasses"],
  },
  {
    id: "sinistros",
    label: "Sinistros",
    group: "Financeiro",
    hrefs: ["/admin/financeiro/sinistros"],
  },
  {
    id: "usuarios",
    label: "Usuários (clientes)",
    group: "Plataforma",
    hrefs: ["/admin/usuarios"],
  },
  { id: "pesquisa", label: "Pesquisa", group: "Plataforma", hrefs: ["/admin/pesquisa"] },
  {
    id: "comparador",
    label: "Comparador de fretes",
    group: "Plataforma",
    hrefs: ["/admin/plataforma/comparador"],
  },
  {
    id: "comparativo",
    label: "Comparativo do site",
    group: "Plataforma",
    hrefs: ["/admin/plataforma/comparativo"],
  },
  {
    id: "pessoas",
    label: "Pessoas e permissões",
    group: "Pessoas",
    hrefs: ["/admin/pessoas/equipe", "/admin/pessoas/acessos", "/admin/pessoas/perfis"],
  },
  {
    id: "auditoria",
    label: "Auditoria",
    group: "Sistema",
    hrefs: ["/admin/sistema/auditoria"],
  },
  {
    id: "integracoes",
    label: "Integrações",
    group: "Sistema",
    hrefs: ["/admin/sistema/integracoes"],
  },
];

export type AreaPermissions = Partial<Record<StaffAction, boolean>>;

/** O que `my_staff_access()` devolve. */
export interface StaffAccess {
  status: "ativo" | "inativo";
  roleId: string;
  roleName: string;
  /** Administrador: tudo liberado. */
  isSystem: boolean;
  jobTitle?: string;
  permissions: Partial<Record<StaffArea, AreaPermissions>>;
}

export function can(
  access: StaffAccess | null | undefined,
  area: StaffArea,
  action: StaffAction = "view",
): boolean {
  if (!access || access.status !== "ativo") return false;
  if (access.isSystem) return true;
  return !!access.permissions[area]?.[action];
}

/** Área da tela pelo endereço (o detalhe herda a área da lista). */
export function areaForPath(pathname: string): StaffArea | undefined {
  const href = activeNavItem(pathname)?.item.href;
  return href ? STAFF_AREAS.find((a) => a.hrefs.includes(href))?.id : undefined;
}

export function areaForHref(href: string): StaffArea | undefined {
  return STAFF_AREAS.find((a) => a.hrefs.includes(href))?.id;
}

/** Marcar criar/editar/excluir marca "ver"; desmarcar "ver" desmarca o resto. */
export function toggleMatrix(
  current: AreaPermissions,
  action: StaffAction,
  value: boolean,
): AreaPermissions {
  if (action === "view") {
    return value ? { ...current, view: true } : {};
  }
  const next = { ...current, [action]: value };
  if (value) next.view = true;
  return next;
}

// --- Equipe ----------------------------------------------------------------

export type TeamKind = "funcionario" | "prestador" | "entregador";

export const TEAM_KINDS: { id: TeamKind; label: string }[] = [
  { id: "funcionario", label: "Funcionário" },
  { id: "prestador", label: "Prestador" },
  { id: "entregador", label: "Entregador" },
];

export type PayRuleKind =
  | "fixo_mensal"
  | "por_rota"
  | "por_parada"
  | "por_coleta"
  | "por_entrega"
  | "por_volume"
  | "por_km"
  | "bonus";

/** `unit` = o que vai depois do valor ("R$ 8,00/parada"). */
export const PAY_RULE_KINDS: { id: PayRuleKind; label: string; unit: string }[] = [
  { id: "fixo_mensal", label: "Fixo mensal", unit: "/mês" },
  { id: "por_rota", label: "Por rota", unit: "/rota" },
  { id: "por_parada", label: "Por parada", unit: "/parada" },
  { id: "por_coleta", label: "Por coleta", unit: "/coleta" },
  { id: "por_entrega", label: "Por entrega", unit: "/entrega" },
  { id: "por_volume", label: "Por volume", unit: "/volume" },
  { id: "por_km", label: "Por km", unit: "/km" },
  { id: "bonus", label: "Bônus", unit: " de bônus" },
];

export interface PayRule {
  kind: PayRuleKind;
  amountBRL: number;
  note?: string;
}

/** "R$ 1.500,00/mês + R$ 8,00/parada + R$ 0,90/km". */
export function payRulesText(rules: PayRule[]): string {
  if (rules.length === 0) return "Sem remuneração cadastrada";
  return rules
    .map((rule) => {
      const unit = PAY_RULE_KINDS.find((k) => k.id === rule.kind)?.unit ?? "";
      return `${formatMoney(rule.amountBRL)}${unit}`;
    })
    .join(" + ");
}

function formatMoney(value: number): string {
  // formatBRL não separa milhar; aqui o valor mensal costuma passar de mil.
  return value >= 1000
    ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : formatBRL(value);
}
