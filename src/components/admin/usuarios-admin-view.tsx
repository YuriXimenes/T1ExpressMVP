"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AdminError, fetchAdminUsers, type AdminUserSummary } from "@/lib/admin/api";

export function formatDate(iso?: string) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function UsuariosAdminView() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAdminUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof AdminError
              ? err.message
              : "Não foi possível carregar os usuários.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return users.filter(
      (u) =>
        !term ||
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        (digits.length > 0 && (u.phone ?? "").replace(/\D/g, "").includes(digits)),
    );
  }, [users, search]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuários</h1>
          {users && (
            <p className="text-sm text-slate-500">
              {users.length}{" "}
              {users.length === 1 ? "usuário cadastrado" : "usuários cadastrados"}
            </p>
          )}
        </div>
        <Input
          placeholder="Buscar por nome, e-mail ou telefone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="sm:w-72"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!users && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {users && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">E-mail</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Cidade/UF</th>
                <th className="px-4 py-2 font-medium">Cadastro</th>
                <th className="px-4 py-2 font-medium">Último acesso</th>
                <th className="px-4 py-2 text-right font-medium">Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => router.push(`/admin/usuarios/${user.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                          <AvatarFallback className="text-[11px]">
                            {initials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium whitespace-nowrap text-slate-900">
                          {user.name}
                        </span>
                        {user.isAdmin && <Badge variant="secondary">Admin</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {user.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {user.city ? `${user.city}/${user.state ?? ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(user.lastSignInAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {user.orderCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
