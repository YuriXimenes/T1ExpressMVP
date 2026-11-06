"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { friendlyAdminError, rpc } from "@/lib/admin/api";
import type {
  AreaPermissions,
  PayRule,
  StaffAccess,
  StaffArea,
  TeamKind,
} from "@/lib/admin/access";

/** Pessoas e acessos (0016_staff_access.sql). */

export async function fetchMyAccess(): Promise<StaffAccess | null> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.rpc("my_staff_access" as never);
  // PGRST202 = a função ainda não existe (banco sem a 0016): vale o acesso de
  // antes, em que quem está em `admins` faz tudo. Some quando a 0016 entra.
  if (error?.code === "PGRST202") return legacyAccess(supabase);
  if (error) throw friendlyAdminError(error);
  return (data as StaffAccess | null) ?? null;
}

async function legacyAccess(
  supabase: ReturnType<typeof createBrowserClient>,
): Promise<StaffAccess | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;
  const { data } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: "ativo",
    roleId: "legacy",
    roleName: "Administrador",
    isSystem: true,
    permissions: {},
  };
}

// --- Usuários do admin --------------------------------------------------------

export interface StaffUser {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  jobTitle?: string;
  roleId: string;
  roleName: string;
  isSystemRole: boolean;
  status: "ativo" | "inativo";
  addedByName?: string;
  createdAt: string;
  lastSignInAt?: string;
}

interface StaffRow {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  role_id: string;
  role_name: string;
  is_system_role: boolean;
  status: "ativo" | "inativo";
  added_by_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export async function fetchStaff(): Promise<StaffUser[]> {
  const rows = await rpc<StaffRow[]>("admin_list_staff", {});
  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    name: r.name,
    email: r.email,
    avatarUrl: r.avatar_url ?? undefined,
    jobTitle: r.job_title ?? undefined,
    roleId: r.role_id,
    roleName: r.role_name,
    isSystemRole: r.is_system_role,
    status: r.status,
    addedByName: r.added_by_name ?? undefined,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at ?? undefined,
  }));
}

export async function addStaff(email: string, roleId: string, jobTitle?: string) {
  await rpc<string>("admin_add_staff", {
    p_email: email,
    p_role: roleId,
    p_job_title: jobTitle ?? null,
  });
}

export async function updateStaff(
  userId: string,
  input: { roleId: string; jobTitle?: string; status: "ativo" | "inativo" },
) {
  await rpc<void>("admin_update_staff", {
    p_user: userId,
    p_role: input.roleId,
    p_job_title: input.jobTitle ?? null,
    p_status: input.status,
  });
}

// --- Perfis --------------------------------------------------------------------

export interface StaffRole {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: Partial<Record<StaffArea, AreaPermissions>>;
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: {
    area: StaffArea;
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }[];
}

export async function fetchRoles(): Promise<StaffRole[]> {
  const { data, error } = await createBrowserClient()
    .from("staff_roles" as never)
    .select(
      "id, name, description, is_system, permissions:staff_role_permissions(area, can_view, can_create, can_edit, can_delete)",
    )
    .order("is_system", { ascending: false })
    .order("name")
    .returns<RoleRow[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    isSystem: r.is_system,
    permissions: Object.fromEntries(
      r.permissions.map((p) => [
        p.area,
        {
          view: p.can_view,
          create: p.can_create,
          edit: p.can_edit,
          delete: p.can_delete,
        },
      ]),
    ),
  }));
}

export async function upsertRole(
  roleId: string | null,
  name: string,
  description?: string,
): Promise<string> {
  return rpc<string>("admin_upsert_role", {
    p_role: roleId,
    p_name: name,
    p_description: description ?? null,
  });
}

export async function setRolePermissions(
  roleId: string,
  permissions: Partial<Record<StaffArea, AreaPermissions>>,
) {
  await rpc<void>("admin_set_role_permissions", {
    p_role: roleId,
    p: Object.entries(permissions).map(([area, p]) => ({ area, ...p })),
  });
}

export async function deleteRole(roleId: string) {
  await rpc<void>("admin_delete_role", { p_role: roleId });
}

// --- Convites --------------------------------------------------------------------

export interface StaffInvite {
  token: string;
  roleId: string;
  roleName: string;
  jobTitle?: string;
  createdByName?: string;
  createdAt: string;
  expiresAt: string;
}

interface InviteRow {
  token: string;
  role_id: string;
  job_title: string | null;
  created_at: string;
  expires_at: string;
  role: { name: string } | null;
  creator: { name: string } | null;
}

/** Convites ainda válidos (sem uso, sem revogar, dentro do prazo). */
export async function fetchPendingInvites(): Promise<StaffInvite[]> {
  const { data, error } = await createBrowserClient()
    .from("staff_invites" as never)
    .select(
      "token, role_id, job_title, created_at, expires_at, role:staff_roles(name), creator:profiles!created_by(name)",
    )
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .returns<InviteRow[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    token: r.token,
    roleId: r.role_id,
    roleName: r.role?.name ?? "",
    jobTitle: r.job_title ?? undefined,
    createdByName: r.creator?.name,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

export async function createInvite(roleId: string, jobTitle?: string): Promise<string> {
  return rpc<string>("admin_create_invite", {
    p_role: roleId,
    p_job_title: jobTitle ?? null,
  });
}

export async function revokeInvite(token: string) {
  await rpc<void>("admin_revoke_invite", { p_token: token });
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/convite/${token}`;
}

// --- Equipe ----------------------------------------------------------------------

export interface TeamMember {
  id: string;
  name: string;
  kind: TeamKind;
  status: "ativo" | "inativo";
  phone?: string;
  email?: string;
  document?: string;
  pixKey?: string;
  notes?: string;
  linkedUser?: { id: string; name: string; email: string };
  payRules: PayRule[];
  /** Entregador vê os próprios ganhos no app (0026). */
  showEarnings: boolean;
}

interface TeamRow {
  id: string;
  name: string;
  kind: TeamKind;
  status: "ativo" | "inativo";
  phone: string | null;
  email: string | null;
  document: string | null;
  pix_key: string | null;
  notes: string | null;
  show_earnings?: boolean | null;
  account: { id: string; name: string; email: string } | null;
  rules: {
    kind: PayRule["kind"];
    amount_brl: number | string;
    note: string | null;
    sort_order: number;
  }[];
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const { data, error } = await createBrowserClient()
    .from("team_members" as never)
    .select(
      `id, name, kind, status, phone, email, document, pix_key, notes, show_earnings,
       account:profiles!user_id(id, name, email),
       rules:team_pay_rules(kind, amount_brl, note, sort_order)`,
    )
    .order("name")
    .returns<TeamRow[]>();
  if (error) throw friendlyAdminError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    status: r.status,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    document: r.document ?? undefined,
    pixKey: r.pix_key ?? undefined,
    notes: r.notes ?? undefined,
    linkedUser: r.account ?? undefined,
    showEarnings: r.show_earnings ?? false,
    payRules: [...r.rules]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((rule) => ({
        kind: rule.kind,
        amountBRL: Number(rule.amount_brl),
        note: rule.note ?? undefined,
      })),
  }));
}

export interface TeamMemberInput {
  name: string;
  kind: TeamKind;
  status: "ativo" | "inativo";
  phone?: string;
  email?: string;
  document?: string;
  pixKey?: string;
  notes?: string;
  /** E-mail da conta a ligar; vazio desliga. */
  linkEmail?: string;
}

/** Salva a ficha e depois a remuneração (duas chamadas: cada uma valida no banco). */
export async function saveTeamMember(
  memberId: string | null,
  input: TeamMemberInput,
  payRules: PayRule[],
): Promise<string> {
  const id = await rpc<string>("admin_upsert_team_member", {
    p_member: memberId,
    p: input,
  });
  await rpc<void>("admin_set_team_pay_rules", { p_member: id, p: payRules });
  return id;
}

/** Liga ou desliga "mostrar ganhos no app" de um entregador (0026). */
export async function setTeamMemberEarnings(
  memberId: string,
  show: boolean,
): Promise<void> {
  await rpc<void>("admin_set_team_member_earnings", { p_member: memberId, p_show: show });
}
