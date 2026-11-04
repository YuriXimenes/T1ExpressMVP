"use client";

import { useEffect, useState } from "react";
import { Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCan } from "@/lib/admin/access-provider";
import {
  STAFF_ACTIONS,
  STAFF_AREAS,
  toggleMatrix,
  type AreaPermissions,
  type StaffArea,
} from "@/lib/admin/access";
import { AdminError } from "@/lib/admin/api";
import {
  deleteRole,
  fetchRoles,
  fetchStaff,
  setRolePermissions,
  upsertRole,
  type StaffRole,
} from "@/lib/admin/people-api";
import { cn } from "@/lib/utils";

type Matrix = Partial<Record<StaffArea, AreaPermissions>>;

const errorText = (err: unknown, fallback: string) =>
  err instanceof AdminError ? err.message : fallback;

export function PerfisView() {
  const canCreate = useCan("pessoas", "create");
  const canEdit = useCan("pessoas", "edit");
  const canDelete = useCan("pessoas", "delete");

  const [roles, setRoles] = useState<StaffRole[] | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matrix, setMatrix] = useState<Matrix>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(select?: string) {
    try {
      const [list, staff] = await Promise.all([fetchRoles(), fetchStaff()]);
      setRoles(list);
      setUsage(
        staff.reduce<Record<string, number>>((acc, s) => {
          acc[s.roleId] = (acc[s.roleId] ?? 0) + 1;
          return acc;
        }, {}),
      );
      const target = list.find((r) => r.id === (select ?? selected)) ?? list[0];
      if (target) pick(target);
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar os perfis."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(role: StaffRole) {
    setSelected(role.id);
    setName(role.name);
    setDescription(role.description ?? "");
    setMatrix(role.permissions);
    setMessage(null);
    setError(null);
  }

  function startNew() {
    setSelected("new");
    setName("");
    setDescription("");
    setMatrix({});
    setMessage(null);
    setError(null);
  }

  const role = roles?.find((r) => r.id === selected);
  const locked = !!role?.isSystem || !(selected === "new" ? canCreate : canEdit);

  async function save() {
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const id = await upsertRole(
        selected === "new" ? null : selected,
        name,
        description,
      );
      await setRolePermissions(id, matrix);
      await load(id);
      setMessage("Perfil salvo.");
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar o perfil."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!role) return;
    setBusy(true);
    try {
      await deleteRole(role.id);
      setSelected(null);
      await load();
    } catch (err) {
      setError(errorText(err, "Não foi possível apagar o perfil."));
    } finally {
      setBusy(false);
    }
  }

  function toggle(area: StaffArea, action: (typeof STAFF_ACTIONS)[number]["id"]) {
    setMatrix((prev) => ({
      ...prev,
      [area]: toggleMatrix(prev[area] ?? {}, action, !prev[area]?.[action]),
    }));
  }

  const groups = [...new Set(STAFF_AREAS.map((a) => a.group))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Perfis e permissões</h1>
          <p className="text-sm text-slate-500">
            O que cada perfil pode ver e fazer em cada área. Vale no menu, nas telas e no
            banco de dados.
          </p>
        </div>
        {canCreate && (
          <Button type="button" onClick={startNew}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo perfil
          </Button>
        )}
      </div>

      {!roles && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {roles && (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <ul className="flex flex-col gap-1.5">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                    selected === r.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900">
                    {r.isSystem && (
                      <Lock
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {usage[r.id] ?? 0} usuário(s)
                  </span>
                </button>
              </li>
            ))}
            {selected === "new" && (
              <li className="border-brand-600 bg-brand-50 rounded-lg border px-3 py-2 text-sm font-medium">
                Novo perfil
              </li>
            )}
          </ul>

          {selected && (
            <Card className="gap-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="role-name">Nome</Label>
                  <Input
                    id="role-name"
                    maxLength={60}
                    value={name}
                    disabled={locked}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="role-description">Descrição</Label>
                  <Input
                    id="role-description"
                    maxLength={300}
                    value={description}
                    disabled={locked}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              {role?.isSystem && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  O Administrador tem acesso total e não pode ser alterado nem apagado.
                </p>
              )}

              {!role?.isSystem && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Área</th>
                        {STAFF_ACTIONS.map((a) => (
                          <th key={a.id} className="px-2 py-2 text-center font-medium">
                            {a.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <FragmentRows
                          key={group}
                          group={group}
                          matrix={matrix}
                          locked={locked}
                          onToggle={toggle}
                        />
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-slate-400">
                    Marcar criar, editar ou excluir marca &ldquo;ver&rdquo; junto. As
                    áreas &ldquo;em breve&rdquo; já ficam configuradas para quando
                    chegarem.
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              {message && <p className="text-sm text-emerald-700">{message}</p>}

              {!locked && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void save()}>
                    {busy ? "Salvando..." : "Salvar perfil"}
                  </Button>
                  {role && canDelete && (
                    <ConfirmDialog
                      trigger={
                        <Button type="button" variant="ghost" disabled={busy}>
                          Apagar perfil
                        </Button>
                      }
                      title={`Apagar o perfil ${role.name}?`}
                      description="Só dá para apagar um perfil sem usuários."
                      confirmLabel="Apagar"
                      onConfirm={() => void remove()}
                    />
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function FragmentRows({
  group,
  matrix,
  locked,
  onToggle,
}: {
  group: string;
  matrix: Matrix;
  locked: boolean;
  onToggle: (area: StaffArea, action: (typeof STAFF_ACTIONS)[number]["id"]) => void;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={5}
          className="pt-3 pb-1 text-left text-[11px] font-semibold tracking-wider text-slate-400 uppercase"
        >
          {group}
        </th>
      </tr>
      {STAFF_AREAS.filter((a) => a.group === group).map((area) => (
        <tr key={area.id} className="border-t border-slate-100">
          <td className="py-2 pr-3 text-slate-700">{area.label}</td>
          {STAFF_ACTIONS.map((action) => (
            <td key={action.id} className="px-2 py-2 text-center">
              <input
                type="checkbox"
                aria-label={`${action.label}: ${area.label}`}
                className="accent-brand-600 h-4 w-4"
                checked={!!matrix[area.id]?.[action.id]}
                disabled={locked}
                onChange={() => onToggle(area.id, action.id)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
