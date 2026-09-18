"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import * as account from "@/lib/account";
import type { CustomPreferredStore, GameTag, SignupAddress } from "@/lib/types/signup";

const STORAGE_KEY = "t1-express:auth-user";

export interface MockUser {
  name: string;
  email: string;
  /** URL pública da foto de perfil no Storage (ou data URL, no formulário de cadastro). */
  avatarUrl?: string;
  phone?: string;
  address?: SignupAddress;
  games?: GameTag[];
  otherGames?: string[];
  preferredStoreIds?: string[];
  customPreferredStores?: CustomPreferredStore[];
}

/**
 * A verdade sobre "quem está logado" é a sessão do Supabase Auth. O
 * localStorage guarda só uma cópia do perfil para a UI renderizar rápido e é
 * reconciliado com a sessão real assim que o app carrega (`isReady`).
 */
const listeners = new Set<() => void>();
let isReadyFlag = false;
let syncStarted = false;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function writeCache(user: MockUser | null) {
  if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(STORAGE_KEY);
  emitChange();
}

function startSessionSync() {
  if (syncStarted) return;
  syncStarted = true;

  createBrowserClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") writeCache(null);
  });

  account
    .restoreSession()
    .then((user) => writeCache(user))
    .catch(() => {
      // Sem rede: mantém a cópia local em vez de deslogar por engano.
    })
    .finally(() => {
      isReadyFlag = true;
      emitChange();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  startSessionSync();
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

let cache: { raw: string | null | undefined; user: MockUser | null } = {
  raw: undefined,
  user: null,
};

function getSnapshot(): MockUser | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cache.raw === raw) return cache.user;
  let user: MockUser | null = null;
  try {
    user = raw ? (JSON.parse(raw) as MockUser) : null;
  } catch {
    user = null;
  }
  cache = { raw, user };
  return user;
}

const getServerSnapshot = (): MockUser | null => null;
const getReadySnapshot = () => isReadyFlag;
const getServerReadySnapshot = () => false;

async function currentUserId(): Promise<string> {
  const { data } = await createBrowserClient().auth.getSession();
  const id = data.session?.user.id;
  if (!id) {
    // Sessão perdida: desfaz o "logado" da tela para as páginas protegidas irem ao login.
    writeCache(null);
    throw new account.AccountError("Sua sessão expirou. Entre novamente.");
  }
  return id;
}

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isReady = useSyncExternalStore(
    subscribe,
    getReadySnapshot,
    getServerReadySnapshot,
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await account.signIn(email, password);
    writeCache(next);
    return next;
  }, []);

  const signUp = useCallback(
    async (password: string, newUser: MockUser, avatarDataUrl?: string) => {
      const next = await account.signUp(password, newUser, avatarDataUrl);
      writeCache(next);
      return next;
    },
    [],
  );

  const saveProfile = useCallback(async (next: MockUser) => {
    await account.saveProfile(await currentUserId(), next);
    writeCache(next);
  }, []);

  const updateAvatar = useCallback(async (dataUrl: string) => {
    const current = getSnapshot();
    if (!current) return;
    const userId = await currentUserId();
    const avatarUrl = await account.uploadAvatar(userId, dataUrl);
    const next = { ...current, avatarUrl };
    await account.saveProfile(userId, next);
    writeCache(next);
  }, []);

  const logout = useCallback(async () => {
    await account.signOut();
    writeCache(null);
  }, []);

  return {
    user,
    isLoggedIn: !!user,
    isReady,
    signIn,
    signUp,
    saveProfile,
    updateAvatar,
    logout,
  };
}
