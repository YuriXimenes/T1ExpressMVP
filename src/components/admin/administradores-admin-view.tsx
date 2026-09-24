"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  AdminError,
  fetchAdmins,
  addAdmin,
  removeAdmin,
  type AdminUser,
} from "@/lib/admin/api";

export function AdministradoresAdminView() {
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    fetchAdmins()
      .then(setAdmins)
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(() => {
    load();
    void createBrowserClient()
      .auth.getSession()
      .then(({ data }) => setSelfId(data.session?.user.id ?? null));
  }, []);

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await addAdmin(email.trim());
      setOpen(false);
      setEmail("");
      load();
    } catch (err) {
      setFormError(
        err instanceof AdminError ? err.message : "Não foi possível adicionar.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(userId: string) {
    try {
      await removeAdmin(userId);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível remover.");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!admins) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Administradores</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Adicionar administrador</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar administrador</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-email">E-mail (precisa já ter conta no site)</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => void save()} disabled={isSaving || !email.trim()}>
                {isSaving ? "Adicionando..." : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Desde</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.userId} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  {admin.name || "—"}
                  {admin.userId === selfId && (
                    <span className="ml-2 text-xs text-slate-400">(você)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{admin.email}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {new Date(admin.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {admin.userId !== selfId && admins.length > 1 && (
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost" className="text-red-600">
                          Remover
                        </Button>
                      }
                      title={`Remover o acesso de ${admin.name || admin.email}?`}
                      description="Essa pessoa deixa de ver o painel administrativo imediatamente."
                      confirmLabel="Remover"
                      onConfirm={() => void remove(admin.userId)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
