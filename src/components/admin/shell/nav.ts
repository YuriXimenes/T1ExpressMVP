import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  CalendarClock,
  Car,
  ClipboardList,
  FileSearch,
  Activity,
  History,
  KeyRound,
  LayoutDashboard,
  Mail,
  MapPin,
  Package,
  Plug,
  PieChart,
  Receipt,
  Route,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tag,
  TriangleAlert,
  Truck,
  TrendingUp,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

/** O que uma tela futura vai ter, mostrado na página "Em breve". */
export interface SoonInfo {
  /** Número da entrega no roteiro do backoffice. */
  delivery: number;
  summary: string;
  features: string[];
}

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Tela ainda não construída: o menu mostra "Em breve". */
  soon?: SoonInfo;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * Menu do backoffice, por categoria. É a fonte única do menu lateral, do
 * caminho no topo da tela e das páginas "Em breve" (`soonItem`).
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Visão geral",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Gestão de pedidos",
    items: [
      { href: "/admin/pedidos", label: "Pedidos", icon: Package },
      { href: "/admin/pedidos/historico", label: "Histórico", icon: History },
      { href: "/admin/pedidos/atividades", label: "Atividades", icon: Activity },
      { href: "/admin/pedidos/coletas", label: "Planejamento", icon: CalendarClock },
      { href: "/admin/pedidos/rotas", label: "Rotas e viagens", icon: Route },
      { href: "/admin/pedidos/veiculos", label: "Veículos e combustível", icon: Car },
      { href: "/admin/pedidos/pontos", label: "Pontos de retirada", icon: MapPin },
      { href: "/admin/pedidos/ocorrencias", label: "Ocorrências", icon: TriangleAlert },
    ],
  },
  {
    label: "Parceiros",
    items: [
      { href: "/admin/parceiros/lojas", label: "Lojas", icon: Store },
      { href: "/admin/parceiros/kyc", label: "KYC / Onboarding", icon: FileSearch },
      { href: "/admin/formularios", label: "Formulários", icon: Mail },
      { href: "/admin/parceiros/desempenho", label: "Desempenho", icon: BarChart3 },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/admin/financeiro", label: "Visão geral", icon: PieChart },
      { href: "/admin/financeiro/precos", label: "Preços", icon: BadgeDollarSign },
      { href: "/admin/financeiro/cupons", label: "Cupons", icon: Tag },
      { href: "/admin/financeiro/despesas", label: "Despesas", icon: Receipt },
      { href: "/admin/financeiro/sinistros", label: "Sinistros", icon: ShieldAlert },
    ],
  },
  {
    label: "Plataforma",
    items: [
      { href: "/admin/plataforma/indicadores", label: "Indicadores", icon: TrendingUp },
      { href: "/admin/usuarios", label: "Usuários", icon: Users },
      { href: "/admin/pesquisa", label: "Pesquisa", icon: ClipboardList },
      {
        href: "/admin/plataforma/comparador",
        label: "Comparador de fretes",
        icon: Truck,
      },
      {
        href: "/admin/plataforma/comparativo",
        label: "Comparativo do site",
        icon: Scale,
      },
    ],
  },
  {
    label: "Pessoas",
    items: [
      { href: "/admin/pessoas/equipe", label: "Equipe", icon: Building2 },
      { href: "/admin/pessoas/acessos", label: "Usuários do admin", icon: UserCog },
      { href: "/admin/pessoas/perfis", label: "Perfis e permissões", icon: KeyRound },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        href: "/admin/sistema/auditoria",
        label: "Auditoria",
        icon: ShieldCheck,
      },
      {
        href: "/admin/sistema/integracoes",
        label: "Integrações",
        icon: Plug,
      },
    ],
  },
];

/**
 * Item do menu que corresponde ao endereço: o de prefixo mais longo, para
 * /admin/pedidos/123 marcar "Pedidos" e /admin/pedidos/rotas marcar "Rotas".
 */
export function activeNavItem(
  pathname: string,
): { group: AdminNavGroup; item: AdminNavItem } | null {
  let best: { group: AdminNavGroup; item: AdminNavItem } | null = null;
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      const matches =
        item.href === "/admin"
          ? pathname === "/admin"
          : pathname === item.href || pathname.startsWith(item.href + "/");
      if (matches && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  return best;
}

/** Item "Em breve" pelo endereço; usado pelas páginas de telas futuras. */
export function soonItem(href: string): AdminNavItem & { soon: SoonInfo } {
  for (const group of ADMIN_NAV) {
    const item = group.items.find((i) => i.href === href);
    if (item?.soon) return item as AdminNavItem & { soon: SoonInfo };
  }
  throw new Error(`Item "Em breve" não cadastrado: ${href}`);
}
