"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/photo-resize";
import type { Statement } from "@/lib/partners/api";
import type { PayRule, TeamKind } from "@/lib/admin/access";
import type {
  ClaimStatus,
  ExpenseGroup,
  ExpenseStatus,
  RefundStatus,
} from "@/lib/finance/rules";

/** Financeiro (0022_finance.sql): despesas, repasses, reembolsos, sinistros e painel. */

export class FinanceError extends Error {}

function friendly(error: { message?: string; code?: string }): FinanceError {
  if (error.code === "P0001" && error.message) return new FinanceError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new FinanceError("Sem conexão. Confira a internet e tente de novo.");
  }
  return new FinanceError("Não foi possível concluir. Tente novamente.");
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) throw friendly(error);
  return data as T;
}

const FINANCE_BUCKET = "finance-docs";
const PARTNER_BUCKET = "partner-docs";

/** Foto (reduzida) ou PDF até 10 MB, enviado para `bucket/folder`. Devolve o caminho. */
async function upload(
  bucket: string,
  folder: string,
  file: File,
): Promise<{ path: string; mime: string }> {
  const isPdf = file.type === "application/pdf";
  let body: Blob;
  let mime: string;
  if (isPdf) {
    if (file.size > 10 * 1024 * 1024) throw new FinanceError("PDF acima de 10 MB.");
    body = file;
    mime = "application/pdf";
  } else if (file.type.startsWith("image/")) {
    try {
      body = await resizeImage(file);
    } catch {
      throw new FinanceError("Não foi possível ler essa imagem. Tente outra.");
    }
    mime = "image/jpeg";
  } else {
    throw new FinanceError("Envie uma foto ou um PDF.");
  }
  const path = `${folder}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
  const { error } = await createBrowserClient()
    .storage.from(bucket)
    .upload(path, body, { contentType: mime });
  if (error)
    throw new FinanceError("Não foi possível enviar o arquivo. Tente novamente.");
  return { path, mime };
}

/** Link temporário de um comprovante (finance-docs, ou partner-docs para lojas). */
export async function financeFileUrl(path: string): Promise<string | null> {
  const bucket = path.startsWith("payouts/") ? PARTNER_BUCKET : FINANCE_BUCKET;
  const { data } = await createBrowserClient()
    .storage.from(bucket)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// --- Despesas -------------------------------------------------------------------------

export interface ExpenseCategory {
  id: string;
  grp: ExpenseGroup;
  name: string;
  active: boolean;
  sort: number;
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await createBrowserClient()
    .from("expense_categories" as never)
    .select("id, grp, name, active, sort")
    .order("grp")
    .order("sort")
    .order("name")
    .returns<ExpenseCategory[]>();
  if (error) throw friendly(error);
  return data ?? [];
}

export async function upsertExpenseCategory(
  id: string | null,
  c: { grp: ExpenseGroup; name: string; active: boolean; sort?: number },
): Promise<string> {
  return call<string>("admin_upsert_expense_category", { p_id: id, p: c });
}

export interface Expense {
  id: string;
  number: number;
  categoryId: string;
  categoryName: string;
  group: ExpenseGroup;
  description: string;
  amount: number;
  competence: string;
  dueDate?: string;
  status: ExpenseStatus;
  tripId?: string;
  orderId?: string;
  storeCode?: string;
  storeName?: string;
  memberId?: string;
  memberName?: string;
  createdBy?: string;
  createdByName?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  paidAt?: string;
  receiptPath?: string;
  note?: string;
  createdAt: string;
  files: { id: string; path: string; name?: string; mime?: string }[];
}

export async function fetchExpenses(from: string, to: string): Promise<Expense[]> {
  return (await call<Expense[]>("admin_expenses", { p_from: from, p_to: to })) ?? [];
}

export interface ExpenseInput {
  categoryId: string;
  description: string;
  amount: number;
  competence: string;
  dueDate?: string;
  storeCode?: string;
  memberId?: string;
  orderId?: string;
  note?: string;
}

export async function saveExpense(
  id: string | null,
  input: ExpenseInput,
  files: File[] = [],
) {
  const expenseId = await call<string>("admin_save_expense", {
    p_id: id,
    p: {
      ...input,
      dueDate: input.dueDate ?? "",
      storeCode: input.storeCode ?? "",
      memberId: input.memberId ?? "",
      orderId: input.orderId ?? "",
    },
  });
  for (const file of files) {
    const { path, mime } = await upload(FINANCE_BUCKET, `expenses/${expenseId}`, file);
    await call<string>("admin_add_expense_file", {
      p_id: expenseId,
      p_path: path,
      p_name: file.name.slice(0, 160),
      p_mime: mime,
    });
  }
  return expenseId;
}

export async function reviewExpense(id: string, approve: boolean, note?: string) {
  await call<void>("admin_review_expense", {
    p_id: id,
    p_approve: approve,
    p_note: note ?? null,
  });
}

export async function payExpense(id: string, paidAt: string, receipt?: File) {
  const path = receipt
    ? (await upload(FINANCE_BUCKET, `expenses/${id}`, receipt)).path
    : null;
  await call<void>("admin_pay_expense", { p_id: id, p_paid_at: paidAt, p_receipt: path });
}

export async function deleteExpense(id: string) {
  const paths = (await call<string[]>("admin_delete_expense", { p_id: id })) ?? [];
  if (paths.length)
    await createBrowserClient().storage.from(FINANCE_BUCKET).remove(paths);
}

// --- Repasses ---------------------------------------------------------------------------

export interface TeamStatement {
  month: string;
  trips: number;
  tripCost: number;
  fixed: number;
  adjustments: { id: string; amount: number; description: string }[];
  adjustmentsTotal: number;
  total: number;
  payout: { amount: number; paidAt: string; receiptPath?: string; note?: string } | null;
}

export interface CustomerPayable {
  kind: "reembolso" | "sinistro";
  id: string;
  number?: number;
  orderId?: string;
  occurrenceId?: string;
  occurrenceNumber?: number;
  customerName?: string;
  customerEmail?: string;
  amount?: number;
  status: RefundStatus | ClaimStatus;
  paidAt?: string;
  receiptPath?: string;
  createdAt: string;
}

export interface PayoutsMonth {
  month: string;
  dueDate: string;
  stores: { id: string; code: string; name: string; statement: Statement }[];
  team: {
    id: string;
    name: string;
    kind: "funcionario" | "prestador" | "entregador";
    status: string;
    pixKey?: string;
    statement: TeamStatement;
  }[];
  customers: CustomerPayable[];
}

export async function fetchPayoutsMonth(month: string): Promise<PayoutsMonth> {
  return call("admin_payouts_month", { p_month: `${month}-01` });
}

export async function addTeamAdjustment(
  memberId: string,
  month: string,
  amount: number,
  description: string,
) {
  await call<string>("admin_add_team_adjustment", {
    p_member: memberId,
    p_month: `${month}-01`,
    p_amount: amount,
    p_description: description,
  });
}

export async function removeTeamAdjustment(id: string) {
  await call<void>("admin_remove_team_adjustment", { p_id: id });
}

export interface PaymentInput {
  amount: number;
  paidAt: string;
  note?: string;
  receipt?: File;
}

export async function payTeamMember(
  memberId: string,
  month: string,
  input: PaymentInput,
) {
  const path = input.receipt
    ? (await upload(FINANCE_BUCKET, `team/${memberId}`, input.receipt)).path
    : null;
  await call<void>("admin_register_team_payout", {
    p_member: memberId,
    p_month: `${month}-01`,
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_receipt: path,
    p_note: input.note ?? null,
  });
}

export async function payStore(
  store: { id: string; code: string },
  month: string,
  input: PaymentInput,
) {
  const path = input.receipt
    ? (await upload(PARTNER_BUCKET, `payouts/${store.id}`, input.receipt)).path
    : null;
  await call<void>("admin_finance_store_payout", {
    p_code: store.code,
    p_month: `${month}-01`,
    p_amount: input.amount,
    p_paid_at: input.paidAt,
    p_receipt: path,
    p_note: input.note ?? null,
  });
}

export async function payRefund(id: string, input: Omit<PaymentInput, "amount">) {
  const path = input.receipt
    ? (await upload(FINANCE_BUCKET, `refunds/${id}`, input.receipt)).path
    : null;
  await call<void>("admin_pay_refund", {
    p_id: id,
    p_paid_at: input.paidAt,
    p_receipt: path,
    p_note: input.note ?? null,
  });
}

export async function cancelRefund(id: string, reason: string) {
  await call<void>("admin_cancel_refund", { p_id: id, p_reason: reason });
}

// --- Sinistros ---------------------------------------------------------------------------

export interface ClaimItem {
  kind: "card" | "accessory";
  itemId: string;
  qty: number;
}

export interface Claim {
  id: string;
  number: number;
  orderId: string;
  occurrenceId?: string;
  occurrenceNumber?: number;
  description?: string;
  items: ClaimItem[];
  declaredAmount: number;
  coverage: number;
  suggestedAmount: number;
  approvedAmount?: number;
  status: ClaimStatus;
  decisionNote?: string;
  paidAt?: string;
  receiptPath?: string;
  createdAt: string;
  updatedAt: string;
  customerName?: string;
  customerEmail?: string;
  insuranceOptedIn?: boolean;
  itemsTotal?: number;
  orderItems?: {
    kind: "card" | "accessory";
    itemId: string;
    label: string;
    store: string;
    quantity: number;
    unitValue: number;
  }[];
  events?: { kind: string; note?: string; actorName?: string; createdAt: string }[];
}

export async function fetchClaims(): Promise<Claim[]> {
  return (await call<Claim[]>("admin_claims")) ?? [];
}

export async function fetchClaim(id: string): Promise<Claim> {
  return call("admin_claim", { p_claim: id });
}

export async function openClaim(orderId: string, description: string): Promise<string> {
  return call<string>("admin_open_claim", {
    p_order: orderId,
    p_description: description,
  });
}

export async function setClaimItems(id: string, items: ClaimItem[]) {
  await call<void>("admin_set_claim_items", { p_claim: id, p_items: items });
}

export async function setClaimStatus(
  id: string,
  status: "aberto" | "em_analise" | "aprovado" | "negado",
  amount?: number,
  note?: string,
) {
  await call<void>("admin_set_claim_status", {
    p_claim: id,
    p_status: status,
    p_amount: amount ?? null,
    p_note: note ?? null,
  });
}

export async function payClaim(id: string, input: Omit<PaymentInput, "amount">) {
  const path = input.receipt
    ? (await upload(FINANCE_BUCKET, `claims/${id}`, input.receipt)).path
    : null;
  await call<void>("admin_pay_claim", {
    p_claim: id,
    p_paid_at: input.paidAt,
    p_receipt: path,
    p_note: input.note ?? null,
  });
}

// --- Painel ------------------------------------------------------------------------------

export interface FinanceMonth {
  month: string;
  revenue: {
    freight: number;
    insurance: number;
    storeCharges: number;
    discounts: number;
    total: number;
  };
  costs: {
    fuel: number;
    stores: number;
    team: number;
    expenses: Partial<Record<ExpenseGroup, number>>;
    expensesTotal: number;
    claims: number;
    refunds: number;
    total: number;
  };
  margin: number;
  marginPct?: number;
}

export interface FinanceOverview {
  month: FinanceMonth;
  history: FinanceMonth[];
  payables: {
    closedMonth: string;
    dueDate: string;
    stores: number;
    team: number;
    expenses: number;
    claims: number;
    refunds: number;
    pendingExpenses: number;
    openClaims: number;
  };
}

export async function fetchFinanceOverview(month: string): Promise<FinanceOverview> {
  return call("admin_finance_overview", { p_month: `${month}-01` });
}

// --- Despesas automáticas (0022a) ----------------------------------------------------------

/** Custos do mês que a plataforma já sabe sozinha; batem com a Visão geral. */
export interface AutoExpenses {
  month: string;
  fuel: {
    total: number;
    trips: {
      id: string;
      day: string;
      driverName?: string;
      vehicleName?: string;
      km?: number;
      cost?: number;
    }[];
  };
  team: {
    total: number;
    /** Falso: o perfil não vê Repasses nem Pessoas, então só o total. */
    detailed: boolean;
    people: {
      id: string;
      name: string;
      kind: TeamKind;
      status: string;
      rules: PayRule[];
      statement: TeamStatement;
    }[];
  };
  stores: {
    total: number;
    items: {
      id: string;
      code: string;
      name: string;
      total: number;
      paid: boolean;
      payout?: { amount: number; paidAt: string; receiptPath?: string } | null;
    }[];
  };
  /** total = pago no mês (igual à Visão geral); pending = aprovado ainda a pagar. */
  claims: {
    total: number;
    pending: number;
    items: {
      id: string;
      number: number;
      orderId?: string;
      amount?: number;
      status: ClaimStatus;
      paidAt?: string;
      receiptPath?: string;
      customerName?: string;
    }[];
  };
  refunds: {
    total: number;
    pending: number;
    items: {
      id: string;
      orderId?: string;
      occurrenceId?: string;
      amount: number;
      status: RefundStatus;
      paidAt?: string;
      receiptPath?: string;
      customerName?: string;
    }[];
  };
}

export async function fetchAutoExpenses(month: string): Promise<AutoExpenses> {
  return call("admin_expenses_auto", { p_month: `${month}-01` });
}
