"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/photo-resize";
import type {
  DocKind,
  DocStatus,
  OnboardingStatus,
  PartnerKind,
  StorePayRuleKind,
} from "@/lib/partners/rules";

/** Parceiros, KYC e área da loja (0020_partners.sql). */

export class PartnerError extends Error {}

function friendly(error: { message?: string; code?: string }): PartnerError {
  if (error.code === "P0001" && error.message) return new PartnerError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new PartnerError("Sem conexão. Confira a internet e tente de novo.");
  }
  return new PartnerError("Não foi possível concluir. Tente novamente.");
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) throw friendly(error);
  return data as T;
}

export const PARTNER_BUCKET = "partner-docs";
const URL_SECONDS = 60 * 60;
const PDF_MAX_BYTES = 10 * 1024 * 1024;

/** Links temporários para arquivos do bucket privado. */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await createBrowserClient()
    .storage.from(PARTNER_BUCKET)
    .createSignedUrls(paths, URL_SECONDS);
  const urls = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return urls;
}

/** Foto (reduzida no navegador) ou PDF até 10 MB, enviado para `folder`. */
async function uploadFile(
  folder: string,
  file: File,
): Promise<{ path: string; mime: string }> {
  const isPdf = file.type === "application/pdf";
  let body: Blob;
  let mime: string;
  if (isPdf) {
    if (file.size > PDF_MAX_BYTES) throw new PartnerError("PDF acima de 10 MB.");
    body = file;
    mime = "application/pdf";
  } else if (file.type.startsWith("image/")) {
    try {
      body = await resizeImage(file);
    } catch {
      throw new PartnerError("Não foi possível ler essa imagem. Tente outra.");
    }
    mime = "image/jpeg";
  } else {
    throw new PartnerError("Envie uma foto ou um PDF.");
  }
  const path = `${folder}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
  const { error } = await createBrowserClient()
    .storage.from(PARTNER_BUCKET)
    .upload(path, body, { contentType: mime });
  if (error)
    throw new PartnerError("Não foi possível enviar o arquivo. Tente novamente.");
  return { path, mime };
}

// --- Onboarding ----------------------------------------------------------------------

export interface OnboardingData {
  legalName?: string;
  tradeName?: string;
  cnpj?: string;
  responsibleName?: string;
  responsibleCpf?: string;
  responsibleEmail?: string;
  responsiblePhone?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  kind?: PartnerKind;
  hours?: Record<string, string>;
  capacity?: string;
  games?: string[];
  payout?: {
    method?: "pix" | "conta" | "";
    pixKey?: string;
    bank?: string;
    agency?: string;
    account?: string;
    holder?: string;
  };
  termsAccepted?: boolean;
  notes?: string;
}

export interface PartnerDocument {
  id: string;
  kind: DocKind;
  path: string;
  name?: string;
  mime?: string;
  status: DocStatus;
  reviewNote?: string;
  createdAt: string;
  url?: string;
}

export interface OnboardingEvent {
  kind: string;
  note?: string;
  actorKind: "admin" | "store" | "system";
  actorName?: string;
  createdAt: string;
}

export interface Onboarding {
  id: string;
  status: OnboardingStatus;
  data: OnboardingData;
  message?: string;
  tokenExpiresAt: string;
  token?: string;
  leadId?: string;
  userEmail?: string;
  storeCode?: string;
  submittedAt?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  missing: string[];
  documents: PartnerDocument[];
  events?: OnboardingEvent[];
}

async function withDocUrls(o: Onboarding): Promise<Onboarding> {
  const urls = await signedUrls(o.documents.map((d) => d.path));
  return { ...o, documents: o.documents.map((d) => ({ ...d, url: urls.get(d.path) })) };
}

export async function previewOnboarding(token: string): Promise<{
  found: boolean;
  tradeName?: string;
  status?: OnboardingStatus;
  expired?: boolean;
}> {
  return call("onboarding_preview", { p_token: token });
}

export async function openOnboarding(token: string): Promise<Onboarding> {
  return withDocUrls(await call<Onboarding>("onboarding_by_token", { p_token: token }));
}

export async function saveOnboarding(token: string, data: OnboardingData) {
  await call<void>("onboarding_save", { p_token: token, p: data });
}

export async function uploadOnboardingDoc(
  token: string,
  onboardingId: string,
  kind: DocKind,
  file: File,
) {
  const { path, mime } = await uploadFile(`onboarding/${onboardingId}`, file);
  try {
    await call<string>("onboarding_add_document", {
      p_token: token,
      p_kind: kind,
      p_path: path,
      p_name: file.name.slice(0, 160),
      p_mime: mime,
    });
  } catch (err) {
    await createBrowserClient().storage.from(PARTNER_BUCKET).remove([path]);
    throw err;
  }
}

export async function removeOnboardingDoc(token: string, docId: string) {
  const path = await call<string>("onboarding_remove_document", {
    p_token: token,
    p_doc: docId,
  });
  if (path) await createBrowserClient().storage.from(PARTNER_BUCKET).remove([path]);
}

export async function submitOnboarding(token: string) {
  await call<void>("onboarding_submit", { p_token: token });
}

// --- Admin: KYC -----------------------------------------------------------------------

export interface OnboardingSummary {
  id: string;
  status: OnboardingStatus;
  tradeName?: string;
  kind?: PartnerKind;
  city?: string;
  responsibleName?: string;
  storeCode?: string;
  tokenExpiresAt: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  pendingDocs: number;
}

export async function fetchOnboardings(): Promise<OnboardingSummary[]> {
  return (await call<OnboardingSummary[]>("admin_onboardings")) ?? [];
}

export async function fetchOnboarding(id: string): Promise<Onboarding> {
  return withDocUrls(await call<Onboarding>("admin_onboarding", { p_onb: id }));
}

export async function startOnboarding(
  leadId?: string,
): Promise<{ id: string; token: string }> {
  return call("admin_start_onboarding", { p_lead: leadId ?? null });
}

export async function renewOnboardingLink(id: string): Promise<string> {
  return call<string>("admin_renew_onboarding_link", { p_onb: id });
}

export async function reviewDocument(docId: string, status: DocStatus, note?: string) {
  await call<void>("admin_review_document", {
    p_doc: docId,
    p_status: status,
    p_note: note ?? null,
  });
}

export async function setOnboardingStatus(
  id: string,
  status: "pendencia" | "aprovado" | "recusado",
  message?: string,
): Promise<{ storeCode?: string }> {
  return call("admin_set_onboarding_status", {
    p_onb: id,
    p_status: status,
    p_message: message ?? null,
  });
}

export const onboardingLink = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/parceiro/cadastro/${token}`;

export const storeInviteLink = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/loja/convite/${token}`;

// --- Finanças da loja -------------------------------------------------------------------

export interface StatementLine {
  kind: StorePayRuleKind;
  amount: number;
  qty: number;
  total: number;
  note?: string;
}

export interface Statement {
  month: string;
  pickups: number;
  collects: number;
  storageDays: number;
  pickupFreight: number;
  lines: StatementLine[];
  total: number;
  payout: { amount: number; paidAt: string; receiptPath?: string; note?: string } | null;
}

export interface NextPayment {
  date: string;
  amount: number;
  month: string;
  estimated: boolean;
  late: boolean;
}

export interface StoreFinance {
  current: Statement;
  previous: Statement;
  next: NextPayment;
  history: Statement[];
}

// --- Admin: ficha da loja ---------------------------------------------------------------

export interface StoreMember {
  userId: string;
  name: string;
  email: string;
  role: "responsavel" | "funcionario";
  active: boolean;
  createdAt: string;
}

export interface StoreInvite {
  token: string;
  role: "responsavel" | "funcionario";
  expiresAt: string;
}

export interface StorePayRule {
  id?: string;
  kind: StorePayRuleKind;
  amount: number;
  note?: string;
}

export interface StoreProfile {
  id: string;
  code: string;
  name: string;
  address: string;
  neighborhood?: string;
  city: string;
  state: string;
  isPickupPoint: boolean;
  published: boolean;
  partnerKind?: PartnerKind;
  hasCoordinates: boolean;
  profile?: {
    legalName?: string;
    cnpj?: string;
    responsibleName?: string;
    responsibleCpf?: string;
    responsibleEmail?: string;
    responsiblePhone?: string;
    payout?: OnboardingData["payout"];
    notes?: string;
  };
  onboarding?: Onboarding;
  payRules: StorePayRule[];
  finance: StoreFinance;
  members: StoreMember[];
  invites: StoreInvite[];
  openOccurrences: number;
}

export async function fetchStoreProfile(code: string): Promise<StoreProfile> {
  const p = await call<StoreProfile>("admin_store_profile", { p_code: code });
  return p.onboarding ? { ...p, onboarding: await withDocUrls(p.onboarding) } : p;
}

export async function setStorePublished(code: string, published: boolean) {
  await call<void>("admin_set_store_published", { p_code: code, p_published: published });
}

export async function setStorePayRules(code: string, rules: StorePayRule[]) {
  await call<void>("admin_set_store_pay_rules", {
    p_code: code,
    p: rules.map((r) => ({ kind: r.kind, amount: r.amount, note: r.note ?? "" })),
  });
}

export async function registerPayout(
  store: { id: string; code: string },
  input: { month: string; amount: number; paidAt: string; note?: string; receipt?: File },
) {
  let receipt: string | null = null;
  if (input.receipt)
    receipt = (await uploadFile(`payouts/${store.id}`, input.receipt)).path;
  await call<void>("admin_register_payout", {
    p_code: store.code,
    p_month: `${input.month}-01`,
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_receipt: receipt,
    p_note: input.note ?? null,
  });
}

export async function createStoreInvite(
  code: string,
  role: "responsavel" | "funcionario",
): Promise<string> {
  return call<string>("admin_store_invite", { p_code: code, p_role: role });
}

export async function setStoreMemberActive(
  code: string,
  userId: string,
  active: boolean,
) {
  await call<void>("admin_set_store_member", {
    p_code: code,
    p_user: userId,
    p_active: active,
  });
}

export interface PartnerPerformance {
  code: string;
  name: string;
  isPickupPoint: boolean;
  published: boolean;
  collected: number;
  pickedUp: number;
  avgHoursToPickup?: number;
  failedStops: number;
  occurrences: number;
  guardExpired: number;
}

export async function fetchPartnerPerformance(
  from: string,
  to: string,
): Promise<PartnerPerformance[]> {
  return (
    (await call<PartnerPerformance[]>("admin_partner_performance", {
      p_from: from,
      p_to: to,
    })) ?? []
  );
}

// --- Área da loja ------------------------------------------------------------------------

export interface MyStore {
  code: string;
  name: string;
  role: "responsavel" | "funcionario";
  isPickupPoint: boolean;
  partnerKind?: PartnerKind;
  published: boolean;
}

export async function fetchMyStores(): Promise<MyStore[]> {
  const { data, error } = await createBrowserClient().rpc("my_stores" as never);
  // Banco ainda sem a 0020: ninguém é loja.
  if (error?.code === "PGRST202") return [];
  if (error) throw friendly(error);
  return (data as MyStore[]) ?? [];
}

export interface StoreDashboard {
  stored: number;
  guardExpired: number;
  toCollect: number;
  pickupsMonth: number;
  openOccurrences: number;
  next: NextPayment;
  monthTotal: number;
}

export async function fetchStoreDashboard(code: string): Promise<StoreDashboard> {
  return call("store_dashboard", { p_code: code });
}

export interface StoreCollection {
  orderId: string;
  customerFirstName?: string;
  stage: string;
  estimatedPickupDate?: string;
  routeDay?: string;
  cards: { name: string; game: string; otherGame?: string; quantity: number }[];
  accessories: { kind: string; other?: string; quantity: number }[];
}

export async function fetchStoreCollections(code: string): Promise<StoreCollection[]> {
  return (await call<StoreCollection[]>("store_collections", { p_code: code })) ?? [];
}

export interface StorePickups {
  stored: {
    orderId: string;
    customerFirstName?: string;
    availableAt?: string;
    guardUntil?: string;
  }[];
  incoming: { orderId: string; customerFirstName?: string }[];
  pickedUp: {
    orderId: string;
    customerFirstName?: string;
    availableAt?: string;
    pickedUpAt: string;
  }[];
}

export async function fetchStorePickups(code: string): Promise<StorePickups> {
  return call("store_pickups", { p_code: code });
}

export async function fetchStoreFinance(code: string): Promise<StoreFinance> {
  return call("store_finance", { p_code: code });
}

export async function fetchStoreTeam(
  code: string,
): Promise<{ members: StoreMember[]; invites: StoreInvite[] }> {
  return call("store_members_list", { p_code: code });
}

export async function inviteStoreMember(code: string): Promise<string> {
  return call<string>("store_invite_member", { p_code: code });
}

export async function setTeamMemberActive(code: string, userId: string, active: boolean) {
  await call<void>("store_set_member_active", {
    p_code: code,
    p_user: userId,
    p_active: active,
  });
}

export async function previewStoreInvite(
  token: string,
): Promise<{ found: boolean; storeName?: string; role?: string; valid?: boolean }> {
  return call("store_invite_preview", { p_token: token });
}

export async function acceptStoreInvite(token: string): Promise<{ storeCode: string }> {
  return call("accept_store_invite", { p_token: token });
}
