"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CustomPreferredStore, GameTag, SignupAddress } from "@/lib/types/signup";

const STORAGE_KEY = "t1-express:auth-user";

export interface MockUser {
  name: string;
  email: string;
  /** Data URL da foto de perfil (já redimensionada no cliente antes de salvar). */
  avatarUrl?: string;
  phone?: string;
  address?: SignupAddress;
  games?: GameTag[];
  otherGames?: string[];
  preferredStoreIds?: string[];
  customPreferredStores?: CustomPreferredStore[];
}

// TODO: substituir por autenticação real (com backend) quando ela existir.
// Por enquanto simula uma sessão salva localmente no navegador do usuário,
// só para permitir testar o fluxo completo de login -> pedido.
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
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

function getServerSnapshot(): MockUser | null {
  return null;
}

export function useAuth() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback((nextUser: MockUser) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    emitChange();
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    emitChange();
  }, []);

  const updateAvatar = useCallback((avatarUrl: string) => {
    const current = getSnapshot();
    if (!current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, avatarUrl }));
    emitChange();
  }, []);

  return { user, isLoggedIn: !!user, login, logout, updateAvatar };
}
