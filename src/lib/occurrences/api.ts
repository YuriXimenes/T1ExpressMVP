"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/photo-resize";
import type {
  OccurrenceActor,
  OccurrenceStatus,
  ResolutionKind,
} from "@/lib/occurrences/rules";

/** Ocorrências (0018_points_occurrences.sql): admin, cliente e entregador. */

/** Erro com mensagem pronta para mostrar. */
export class OccurrenceError extends Error {}

function friendly(error: { message?: string; code?: string }): OccurrenceError {
  if (error.code === "P0001" && error.message) return new OccurrenceError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new OccurrenceError("Sem conexão. Confira a internet e tente de novo.");
  }
  return new OccurrenceError("Não foi possível concluir. Tente novamente.");
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await createBrowserClient().rpc(name as never, args as never);
  if (error) throw friendly(error);
  return data as T;
}

const BUCKET = "order-photos";
const URL_SECONDS = 60 * 60;
const PDF_MAX_BYTES = 5 * 1024 * 1024;

// --- Tipos -------------------------------------------------------------------------

export interface OccurrenceType {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  driverCan: boolean;
  customerCan: boolean;
  systemKind?: "conferencia" | "loja_fechada" | "guarda_vencida";
  deadlineHours: number;
  requiresPhoto: boolean;
  sort: number;
}

interface TypeRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  driver_can: boolean;
  customer_can: boolean;
  system_kind: OccurrenceType["systemKind"] | null;
  deadline_hours: number;
  requires_photo: boolean;
  sort: number;
}

/** Todos os tipos (o admin edita) ou só os ativos de quem abre. */
export async function fetchOccurrenceTypes(
  filter: "all" | "customer" | "driver" = "all",
): Promise<OccurrenceType[]> {
  let query = createBrowserClient()
    .from("occurrence_types" as never)
    .select(
      "id, name, description, active, driver_can, customer_can, system_kind, deadline_hours, requires_photo, sort",
    )
    .order("sort")
    .order("name");
  if (filter === "customer") query = query.eq("active", true).eq("customer_can", true);
  if (filter === "driver") query = query.eq("active", true).eq("driver_can", true);
  const { data, error } = await query.returns<TypeRow[]>();
  if (error) throw friendly(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    active: r.active,
    driverCan: r.driver_can,
    customerCan: r.customer_can,
    systemKind: r.system_kind ?? undefined,
    deadlineHours: r.deadline_hours,
    requiresPhoto: r.requires_photo,
    sort: r.sort,
  }));
}

export async function upsertOccurrenceType(
  id: string | null,
  type: Omit<OccurrenceType, "id" | "systemKind">,
): Promise<string> {
  return call<string>("admin_upsert_occurrence_type", { p_id: id, p: type });
}

// --- Ocorrência ------------------------------------------------------------------

export interface OccurrenceUpdate {
  id: number;
  kind:
    "opened" | "comment" | "status" | "assign" | "resolution" | "attachment" | "reopened";
  body?: string;
  from?: string;
  to?: string;
  internal: boolean;
  authorKind: OccurrenceActor;
  authorName?: string;
  createdAt: string;
}

export interface OccurrenceAttachment {
  id: string;
  path: string;
  name?: string;
  mime?: string;
  authorKind: OccurrenceActor;
  createdAt: string;
  /** Link temporário (bucket privado). */
  url?: string;
}

export interface OccurrenceResolution {
  id: string;
  kind: ResolutionKind;
  amountBrl?: number;
  couponCode?: string;
  couponType?: "percent" | "flat";
  newGuardUntil?: string;
  note?: string;
  createdAt: string;
}

export interface Occurrence {
  id: string;
  number: number;
  typeId: string;
  typeName: string;
  systemKind?: OccurrenceType["systemKind"];
  orderId?: string;
  storeCode?: string;
  storeName?: string;
  tripId?: string;
  stopId?: string;
  openedKind: OccurrenceActor;
  openedByName?: string;
  description: string;
  status: OccurrenceStatus;
  assigneeId?: string;
  assigneeName?: string;
  dueAt: string;
  resolvedAt?: string;
  autoCloseAt?: string;
  closedAt?: string;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
  updates?: OccurrenceUpdate[];
  attachments?: OccurrenceAttachment[];
  resolutions?: OccurrenceResolution[];
}

/** Links temporários dos anexos. */
async function withUrls(occurrence: Occurrence): Promise<Occurrence> {
  const attachments = occurrence.attachments ?? [];
  if (attachments.length === 0) return occurrence;
  const { data } = await createBrowserClient()
    .storage.from(BUCKET)
    .createSignedUrls(
      attachments.map((a) => a.path),
      URL_SECONDS,
    );
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return {
    ...occurrence,
    attachments: attachments.map((a) => ({ ...a, url: urls.get(a.path) ?? undefined })),
  };
}

// --- Admin -------------------------------------------------------------------------

export async function fetchOccurrences(orderId?: string): Promise<Occurrence[]> {
  return (
    (await call<Occurrence[]>("admin_occurrences", { p_order: orderId ?? null })) ?? []
  );
}

export async function fetchOccurrence(id: string): Promise<Occurrence> {
  return withUrls(await call<Occurrence>("admin_occurrence", { p_occ: id }));
}

export interface OccurrenceSummary {
  aberta: number;
  emAnalise: number;
  resolvida: number;
  encerrada: number;
  overdue: number;
  guardExpired: number;
}

export async function fetchOccurrenceSummary(): Promise<OccurrenceSummary> {
  return call<OccurrenceSummary>("admin_occurrence_summary");
}

export async function fetchAssignees(): Promise<{ id: string; name: string }[]> {
  return (await call<{ id: string; name: string }[]>("admin_occurrence_assignees")) ?? [];
}

export async function openOccurrence(input: {
  typeId: string;
  orderId?: string;
  storeCode?: string;
  description: string;
}): Promise<{ id: string; number: number }> {
  return call("admin_open_occurrence", { p: input });
}

export async function updateOccurrence(
  id: string,
  change: {
    status?: OccurrenceStatus;
    assigneeId?: string | null;
    comment?: string;
    internal?: boolean;
  },
) {
  const p: Record<string, unknown> = { ...change };
  if ("assigneeId" in change) p.assigneeId = change.assigneeId ?? "";
  await call<void>("admin_update_occurrence", { p_occ: id, p });
}

export async function reopenOccurrence(id: string, reason: string) {
  await call<void>("admin_reopen_occurrence", { p_occ: id, p_reason: reason });
}

export async function addResolution(
  id: string,
  input: {
    kind: ResolutionKind;
    amountBrl?: number;
    couponType?: "percent" | "flat";
    newGuardDate?: string;
    note?: string;
  },
): Promise<{ couponCode?: string }> {
  const result = await call<{ couponCode: string | null }>("admin_add_resolution", {
    p_occ: id,
    p: input,
  });
  return { couponCode: result?.couponCode ?? undefined };
}

// --- Cliente e entregador ---------------------------------------------------------

export async function fetchMyOrderOccurrences(orderId: string): Promise<Occurrence[]> {
  const list =
    (await call<Occurrence[]>("my_order_occurrences", { p_order: orderId })) ?? [];
  return Promise.all(list.map(withUrls));
}

export async function customerOpenOccurrence(
  orderId: string,
  typeId: string,
  description: string,
): Promise<{ id: string; number: number }> {
  return call("customer_open_occurrence", {
    p_order: orderId,
    p_type: typeId,
    p_description: description,
  });
}

export async function fetchStoreOccurrences(storeCode: string): Promise<Occurrence[]> {
  const list =
    (await call<Occurrence[]>("store_occurrences", { p_code: storeCode })) ?? [];
  return Promise.all(list.map(withUrls));
}

export async function fetchDriverOccurrences(): Promise<Occurrence[]> {
  const list = (await call<Occurrence[]>("driver_my_occurrences")) ?? [];
  return Promise.all(list.map(withUrls));
}

export async function driverOpenOccurrence(input: {
  typeId: string;
  stopId: string;
  orderId?: string;
  description: string;
  lat?: number;
  lng?: number;
}): Promise<{ id: string; number: number }> {
  return call("driver_open_occurrence", {
    p: { ...input, lat: input.lat ?? "", lng: input.lng ?? "" },
  });
}

export async function commentOccurrence(id: string, body: string) {
  await call<void>("occurrence_comment", { p_occ: id, p_body: body });
}

/** Foto (reduzida no navegador) ou PDF de até 5 MB. */
export async function uploadOccurrenceFile(id: string, file: File) {
  const isPdf = file.type === "application/pdf";
  let body: Blob;
  let mime: string;
  if (isPdf) {
    if (file.size > PDF_MAX_BYTES) throw new OccurrenceError("PDF acima de 5 MB.");
    body = file;
    mime = "application/pdf";
  } else if (file.type.startsWith("image/")) {
    try {
      body = await resizeImage(file);
    } catch {
      throw new OccurrenceError("Não foi possível ler essa foto. Tente outra.");
    }
    mime = "image/jpeg";
  } else {
    throw new OccurrenceError("Envie uma foto ou um PDF.");
  }
  const supabase = createBrowserClient();
  const path = `occurrences/${id}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: mime });
  if (error)
    throw new OccurrenceError("Não foi possível enviar o arquivo. Tente novamente.");
  try {
    await call<string>("occurrence_add_attachment", {
      p_occ: id,
      p_path: path,
      p_name: file.name.slice(0, 160),
      p_mime: mime,
    });
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw err;
  }
}
