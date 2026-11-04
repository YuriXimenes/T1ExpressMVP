"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAccess, useCan } from "@/lib/admin/access-provider";
import { AdminError } from "@/lib/admin/api";
import {
  addStaff,
  createInvite,
  fetchPendingInvites,
  fetchRoles,
  fetchStaff,
  inviteUrl,
  revokeInvite,
  updateStaff,
  type StaffInvite,
  type StaffRole,
  type StaffUser,
} from "@/lib/admin/people-api";
import { createBrowserClient } from "@/lib/supabase/client";
import { initials } from "@/lib/initials";

const errorText = (err: unknown, fallback: string) =>
  err instanceof AdminError ? err.message : fallback;

const dateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";

function RoleSelect({
  id,
  roles,
  value,
  onChange,
  allowSystem,
}: {
  id: string;
  roles: StaffRole[];
  value: string;
  onChange: (value: string) => void;
  allowSystem: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Escolha o perfil" />
      </SelectTrigger>
      <SelectContent>
        {roles
          .filter((r) => allowSystem || !r.isSystem)
          .map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Copiado" : "Copiar link"}
    </Button>
  );
}

type DialogState =
  | { kind: "add" }
  | { kind: "invite"; link?: string }
  | { kind: "edit"; user: StaffUser }
  | null;

export function AcessosView() {
  const access = useAccess();
  const canCreate = useCan("pessoas", "create");
  const canEdit = useCan("pessoas", "edit");
  const canDelete = useCan("pessoas", "delete");
  const isFullAdmin = !!access?.isSystem;

  const [staff, setStaff] = useState<StaffUser[] | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [s, r, i] = await Promise.all([
        fetchStaff(),
        fetchRoles(),
        fetchPendingInvites(),
      ]);
      setStaff(s);
      setRoles(r);
      setInvites(i);
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    void createBrowserClient()
      .auth.getSession()
      .then(({ data }) => setSelfId(data.session?.user.id ?? null));
  }, []);

  function open(next: DialogState) {
    setFormError(null);
    setEmail("");
    setRoleId(next?.kind === "edit" ? next.user.roleId : "");
    setJobTitle(next?.kind === "edit" ? (next.user.jobTitle ?? "") : "");
    setStatus(next?.kind === "edit" ? next.user.status : "ativo");
    setDialog(next);
  }

  async function submit() {
    if (!dialog || busy) return;
    if (!roleId) {
      setFormError("Escolha o perfil.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (dialog.kind === "add") {
        await addStaff(email.trim(), roleId, jobTitle.trim() || undefined);
        setDialog(null);
      } else if (dialog.kind === "edit") {
        await updateStaff(dialog.user.userId, {
          roleId,
          jobTitle: jobTitle.trim() || undefined,
          status,
        });
        setDialog(null);
      } else {
        const token = await createInvite(roleId, jobTitle.trim() || undefined);
        setDialog({ kind: "invite", link: inviteUrl(window.location.origin, token) });
      }
      await load();
    } catch (err) {
      setFormError(errorText(err, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    try {
      await revokeInvite(token);
      await load();
    } catch (err) {
      setError(errorText(err, "Não foi possível revogar."));
    }
  }

  const editingSelf = dialog?.kind === "edit" && dialog.user.userId === selfId;
  const editingSystem = dialog?.kind === "edit" && dialog.user.isSystemRole;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuários do admin</h1>
          <p className="text-sm text-slate-500">
            Quem acessa o backoffice, com qual perfil. As permissões de cada perfil ficam
            em Perfis e permissões.
          </p>
        </div>
        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => open({ kind: "add" })}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Adicionar pelo e-mail
            </Button>
            <Button type="button" onClick={() => open({ kind: "invite" })}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Gerar convite
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!staff && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {staff && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Pessoa</th>
                <th className="px-4 py-2 font-medium">Função</th>
                <th className="px-4 py-2 font-medium">Perfil</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Último acesso</th>
                <th className="px-4 py-2 font-medium">Adicionado por</th>
                <th className="px-4 py-2 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                <tr key={user.userId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        <AvatarImage src={user.avatarUrl} alt="" />
                        <AvatarFallback className="text-[10px]">
                          {initials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {user.name}
                          {user.userId === selfId && (
                            <span className="ml-1 text-xs font-normal text-slate-400">
                              (você)
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.jobTitle ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{user.roleName}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={user.status === "ativo" ? "secondary" : "destructive"}
                    >
                      {user.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {dateTime(user.lastSignInAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{user.addedByName ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && (!user.isSystemRole || isFullAdmin) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => open({ kind: "edit", user })}
                      >
                        Editar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-slate-900">Convites pendentes</h2>
          <ul className="flex flex-col gap-2">
            {invites.map((invite) => (
              <li
                key={invite.token}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    {invite.roleName}
                    {invite.jobTitle && ` · ${invite.jobTitle}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Criado por {invite.createdByName ?? "—"} · vale até{" "}
                    {dateTime(invite.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <CopyButton text={inviteUrl(window.location.origin, invite.token)} />
                  {canDelete && (
                    <ConfirmDialog
                      trigger={
                        <Button type="button" size="sm" variant="ghost">
                          Revogar
                        </Button>
                      }
                      title="Revogar este convite?"
                      description="O link deixa de funcionar. Dá para gerar outro depois."
                      confirmLabel="Revogar"
                      onConfirm={() => void revoke(invite.token)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={!!dialog}
        onOpenChange={(value) => !value && !busy && setDialog(null)}
      >
        {dialog && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog.kind === "add"
                  ? "Adicionar pelo e-mail"
                  : dialog.kind === "invite"
                    ? "Gerar convite"
                    : `Editar ${dialog.user.name}`}
              </DialogTitle>
              <DialogDescription>
                {dialog.kind === "add"
                  ? "Para quem já tem conta no site da T1 Express."
                  : dialog.kind === "invite"
                    ? "Para quem ainda não tem conta. O link vale 7 dias e uma vez só: mande por WhatsApp."
                    : "Mudanças valem no próximo carregamento da tela da pessoa."}
              </DialogDescription>
            </DialogHeader>

            {dialog.kind === "invite" && dialog.link ? (
              <div className="flex flex-col gap-3">
                <Input readOnly value={dialog.link} onFocus={(e) => e.target.select()} />
                <CopyButton text={dialog.link} />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dialog.kind === "add" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="staff-email">E-mail da conta</Label>
                    <Input
                      id="staff-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-role">Perfil</Label>
                  <RoleSelect
                    id="staff-role"
                    roles={roles}
                    value={roleId}
                    onChange={setRoleId}
                    allowSystem={isFullAdmin && !editingSelf}
                  />
                  {editingSelf && editingSystem && (
                    <p className="text-xs text-slate-500">
                      Você não pode tirar o seu próprio acesso de Administrador.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="staff-job">Função (opcional)</Label>
                  <Input
                    id="staff-job"
                    maxLength={80}
                    placeholder="Ex.: Coordenador de operação"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
                {dialog.kind === "edit" && !editingSelf && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="staff-status">Status</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => setStatus(v as "ativo" | "inativo")}
                    >
                      <SelectTrigger id="staff-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo (sem acesso)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {formError && (
                  <p role="alert" className="text-sm text-red-600">
                    {formError}
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                {dialog.kind === "invite" && dialog.link ? "Fechar" : "Cancelar"}
              </Button>
              {!(dialog.kind === "invite" && dialog.link) && (
                <Button type="button" disabled={busy} onClick={() => void submit()}>
                  {busy
                    ? "Salvando..."
                    : dialog.kind === "invite"
                      ? "Gerar link"
                      : "Salvar"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
