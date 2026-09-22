"use client";

import { createBrowserClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";
import type { GameTag } from "@/lib/types/signup";

/** Erro com mensagem pronta para mostrar ao usuário. */
export class LeadError extends Error {}

function friendlyLeadError(error: { message?: string; code?: string }): LeadError {
  // As funções do banco levantam P0001 com texto já em português e seguro para exibir.
  if (error.code === "P0001" && error.message) return new LeadError(error.message);
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("failed to fetch") || message.includes("network")) {
    return new LeadError("Sem conexão com o servidor. Tente novamente.");
  }
  return new LeadError("Não foi possível enviar. Tente novamente.");
}

export interface PartnerLeadInput {
  storeName: string;
  wantsPickup: boolean;
  wantsDropoff: boolean;
  street: string;
  number: string;
  complement?: string;
  city: string;
  state: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  website?: string;
  games: GameTag[];
  otherGames?: string[];
  message?: string;
  /** Campo armadilha: deve ficar sempre vazio para uma pessoa de verdade. */
  company?: string;
}

export async function submitPartnerLead(input: PartnerLeadInput): Promise<void> {
  // O formato de `input` é garantido pela interface acima e validado de novo
  // no banco; o cast só contorna o tipo `Json` genérico do client tipado.
  const { error } = await createBrowserClient().rpc("submit_partner_lead", {
    p: input as unknown as Json,
  });
  if (error) throw friendlyLeadError(error);
}

export interface StoreSuggestionInput {
  storeName: string;
  storeAddress: string;
  comment?: string;
  /** Campo armadilha: deve ficar sempre vazio para uma pessoa de verdade. */
  website?: string;
}

export async function submitStoreSuggestion(input: StoreSuggestionInput): Promise<void> {
  const { error } = await createBrowserClient().rpc("submit_store_suggestion", {
    p: input as unknown as Json,
  });
  if (error) throw friendlyLeadError(error);
}
