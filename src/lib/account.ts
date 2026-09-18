"use client";

import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";
import type { MockUser } from "@/lib/auth";
import type { GameTag } from "@/lib/types/signup";

const ORDERS_KEY = "t1-express:mock-orders";
const PENDING_ORDER_KEY = "t1-express:pending-order";
const ORDERS_OWNER_KEY = "t1-express:orders-owner";

/** Erro com mensagem pronta para mostrar ao usuário. */
export class AccountError extends Error {}

interface ProfileRow {
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  street: string | null;
  street_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  complement: string | null;
  games: GameTag[] | null;
  other_games: string[] | null;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Já existe uma conta com esse e-mail. Tente entrar.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (m.includes("different from the old password"))
    return "A nova senha precisa ser diferente da atual.";
  if (m.includes("session") || m.includes("not authenticated"))
    return "Link inválido ou expirado. Peça um novo link.";
  if (m.includes("password")) return "A senha não atende aos requisitos.";
  if (m.includes("email")) return "Confira o e-mail informado.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sem conexão com o servidor. Tente novamente.";
  return "Não foi possível concluir. Tente novamente.";
}

async function storeIdByCode(): Promise<Map<string, string>> {
  const { data, error } = await createBrowserClient().from("stores").select("id, code");
  if (error) throw new AccountError("Não foi possível carregar as lojas.");
  return new Map((data ?? []).map((s) => [s.code as string, s.id as string]));
}

export async function fetchProfile(userId: string): Promise<MockUser | null> {
  const supabase = createBrowserClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "name, email, phone, avatar_url, street, street_number, neighborhood, city, state, zip, complement, games, other_games",
    )
    .eq("id", userId)
    .maybeSingle<ProfileRow>();
  if (!profile) return null;

  const [{ data: links }, { data: customs }] = await Promise.all([
    supabase
      .from("profile_preferred_stores")
      .select("store:stores(code)")
      .eq("profile_id", userId),
    supabase
      .from("custom_preferred_stores")
      .select("name, address")
      .eq("profile_id", userId)
      .order("created_at"),
  ]);

  const hasAddress = profile.street || profile.city || profile.zip;
  return {
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.avatar_url ?? undefined,
    phone: profile.phone ?? undefined,
    address: hasAddress
      ? {
          street: profile.street ?? "",
          number: profile.street_number ?? undefined,
          neighborhood: profile.neighborhood ?? "",
          city: profile.city ?? "",
          state: profile.state ?? "",
          zip: profile.zip ?? "",
          complement: profile.complement ?? undefined,
        }
      : undefined,
    games: profile.games ?? [],
    otherGames: profile.other_games?.length ? profile.other_games : undefined,
    preferredStoreIds: (links ?? [])
      .map((l) => (l as unknown as { store: { code: string } | null }).store?.code)
      .filter((c): c is string => !!c),
    customPreferredStores: (customs ?? []) as { name: string; address: string }[],
  };
}

/** Grava o perfil inteiro (perfil + lojas de preferência) do usuário logado. */
export async function saveProfile(userId: string, user: MockUser): Promise<void> {
  const supabase = createBrowserClient();

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    avatar_url: user.avatarUrl ?? null,
    street: user.address?.street ?? null,
    street_number: user.address?.number ?? null,
    neighborhood: user.address?.neighborhood ?? null,
    city: user.address?.city ?? null,
    state: user.address?.state ?? null,
    zip: user.address?.zip ?? null,
    complement: user.address?.complement ?? null,
    games: user.games ?? [],
    other_games: user.otherGames ?? [],
  });
  if (error) throw new AccountError("Não foi possível salvar seus dados.");

  const codeToId = await storeIdByCode();
  const storeIds = (user.preferredStoreIds ?? [])
    .map((code) => codeToId.get(code))
    .filter((id): id is string => !!id);

  const del1 = await supabase
    .from("profile_preferred_stores")
    .delete()
    .eq("profile_id", userId);
  const del2 = await supabase
    .from("custom_preferred_stores")
    .delete()
    .eq("profile_id", userId);
  if (del1.error || del2.error)
    throw new AccountError("Não foi possível salvar suas lojas.");

  if (storeIds.length > 0) {
    const { error: e } = await supabase
      .from("profile_preferred_stores")
      .insert(storeIds.map((store_id) => ({ profile_id: userId, store_id })));
    if (e) throw new AccountError("Não foi possível salvar suas lojas.");
  }
  const customs = user.customPreferredStores ?? [];
  if (customs.length > 0) {
    const { error: e } = await supabase
      .from("custom_preferred_stores")
      .insert(
        customs.map((c) => ({ profile_id: userId, name: c.name, address: c.address })),
      );
    if (e) throw new AccountError("Não foi possível salvar suas lojas.");
  }
}

/** Envia a foto (data URL) para o Storage e devolve a URL pública. */
export async function uploadAvatar(userId: string, dataUrl: string): Promise<string> {
  const supabase = createBrowserClient();
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) throw new AccountError("Não foi possível enviar a foto.");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Pedidos (ainda mock) ficam no localStorage do navegador. Para não vazarem
 * entre contas, limpamos quando o usuário logado muda.
 */
export function claimLocalDataFor(userId: string | null) {
  const owner = window.localStorage.getItem(ORDERS_OWNER_KEY);
  if (userId !== null && owner === userId) return;
  window.localStorage.removeItem(ORDERS_KEY);
  window.sessionStorage.removeItem(PENDING_ORDER_KEY);
  if (userId === null) window.localStorage.removeItem(ORDERS_OWNER_KEY);
  else window.localStorage.setItem(ORDERS_OWNER_KEY, userId);
  window.dispatchEvent(new StorageEvent("storage", { key: ORDERS_KEY }));
}

export async function signIn(email: string, password: string): Promise<MockUser> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user)
    throw new AccountError(friendlyAuthError(error?.message ?? ""));
  return finishSession(data.user);
}

export async function signUp(
  password: string,
  user: MockUser,
  avatarDataUrl?: string,
): Promise<MockUser> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email: user.email,
    password,
    options: { data: { name: user.name } },
  });
  if (error) throw new AccountError(friendlyAuthError(error.message));
  if (!data.user) throw new AccountError("Não foi possível criar a conta.");
  // Com e-mail já cadastrado o Supabase não devolve erro nem sessão (identities vazio).
  if (data.user.identities?.length === 0) {
    throw new AccountError("Já existe uma conta com esse e-mail. Tente entrar.");
  }
  if (!data.session) {
    throw new AccountError(
      "A confirmação de e-mail ainda está ativa no servidor. Avise o suporte.",
    );
  }

  let avatarUrl: string | undefined;
  if (avatarDataUrl) {
    try {
      avatarUrl = await uploadAvatar(data.user.id, avatarDataUrl);
    } catch {
      avatarUrl = undefined;
    }
  }
  const full: MockUser = { ...user, avatarUrl };
  await saveProfile(data.user.id, full);
  claimLocalDataFor(data.user.id);
  return full;
}

async function finishSession(authUser: User): Promise<MockUser> {
  const profile = await fetchProfile(authUser.id);
  claimLocalDataFor(authUser.id);
  return (
    profile ?? {
      name:
        (authUser.user_metadata?.name as string) ?? authUser.email?.split("@")[0] ?? "",
      email: authUser.email ?? "",
    }
  );
}

/**
 * Pede o e-mail de recuperação. O Supabase responde igual para e-mails com e
 * sem conta, então quem chama deve mostrar sempre a mesma mensagem.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await createBrowserClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  });
  if (error) throw new AccountError(friendlyAuthError(error.message));
}

/** Troca a senha do usuário logado (inclusive pela sessão de recuperação). */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await createBrowserClient().auth.updateUser({
    password: newPassword,
  });
  if (error) throw new AccountError(friendlyAuthError(error.message));
}

export async function signOut() {
  await createBrowserClient().auth.signOut();
  claimLocalDataFor(null);
}

/** Restaura a sessão (se houver) ao carregar o app. */
export async function restoreSession(): Promise<MockUser | null> {
  const { data } = await createBrowserClient().auth.getSession();
  if (!data.session) return null;
  return finishSession(data.session.user);
}
