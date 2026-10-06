"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatBRL } from "@/components/shared/price";
import { formatDate, initials } from "@/components/admin/usuarios-admin-view";
import { statusLabel, statusVariant } from "@/components/admin/pedidos-admin-view";
import { useCatalog } from "@/lib/catalog/provider";
import { gameOptions } from "@/lib/data/games";
import { AdminError, fetchAdminUser, type AdminUserDetail } from "@/lib/admin/api";

const NOT_INFORMED = <span className="text-slate-400">Não informado</span>;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 sm:text-right">{children || NOT_INFORMED}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-3 p-6 text-sm">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {title}
      </p>
      {children}
    </Card>
  );
}

function formatDateTime(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : undefined;
}

export function UsuarioAdminDetailView({ userId }: { userId: string }) {
  const router = useRouter();
  const { coletaPartners } = useCatalog();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUser(userId)
      .then((data) => {
        if (cancelled) return;
        if (data) setDetail(data);
        else setError("Usuário não encontrado.");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof AdminError
              ? err.message
              : "Não foi possível carregar o usuário.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const back = (
    <Link
      href="/admin/usuarios"
      className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para Usuários
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!detail) return <p className="text-sm text-slate-500">Carregando...</p>;

  const { summary, profile, orders } = detail;
  const address = profile.address;
  const games = [
    ...(profile.games ?? [])
      .filter((g) => g !== "outro")
      .map((g) => gameOptions.find((o) => o.id === g)?.label ?? g),
    ...(profile.otherGames ?? []),
  ];
  const preferred = coletaPartners.filter((p) =>
    (profile.preferredStoreIds ?? []).includes(p.id),
  );
  const customs = profile.customPreferredStores ?? [];

  return (
    <div>
      {back}

      <div className="mt-4 flex min-w-0 items-center gap-4">
        <Avatar className="h-14 w-14 shrink-0">
          {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
          <AvatarFallback>{initials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold break-words text-slate-900">
              {profile.name}
            </h1>
            {summary.isAdmin && <Badge variant="secondary">Admin</Badge>}
          </div>
          <p className="text-sm break-all text-slate-500">{profile.email}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <Section title="Dados pessoais">
            <Field label="Telefone">{profile.phone}</Field>
            <Field label="Cadastro">{formatDateTime(summary.createdAt)}</Field>
            <Field label="Último acesso">{formatDateTime(summary.lastSignInAt)}</Field>
            <Field label="E-mail confirmado">
              {summary.emailConfirmed ? "Sim" : "Não"}
            </Field>
          </Section>

          <Section title="Endereço">
            {address ? (
              <>
                <Field label="Rua">
                  {[address.street, address.number].filter(Boolean).join(", ")}
                </Field>
                <Field label="Complemento">{address.complement}</Field>
                <Field label="Bairro">{address.neighborhood}</Field>
                <Field label="Cidade/UF">
                  {address.city && `${address.city}/${address.state}`}
                </Field>
                <Field label="CEP">{address.zip}</Field>
              </>
            ) : (
              NOT_INFORMED
            )}
          </Section>

          <Section title="Jogos">
            {games.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {games.map((g) => (
                  <Badge key={g} variant="outline">
                    {g}
                  </Badge>
                ))}
              </div>
            ) : (
              NOT_INFORMED
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Lojas preferidas">
            {preferred.length === 0 && customs.length === 0 ? (
              NOT_INFORMED
            ) : (
              <ul className="space-y-2.5">
                {preferred.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <div
                      className={
                        p.onDark
                          ? "flex h-9 w-14 shrink-0 items-center justify-center rounded bg-slate-900 p-1"
                          : "flex h-9 w-14 shrink-0 items-center justify-center rounded border border-slate-100 p-1"
                      }
                    >
                      <Image
                        src={p.logo}
                        alt=""
                        width={56}
                        height={36}
                        className="h-full w-auto object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {p.neighborhood}, {p.city}
                      </p>
                    </div>
                  </li>
                ))}
                {customs.map((c) => (
                  <li key={`${c.name}-${c.address}`} className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {c.name}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        (indicada pelo usuário)
                      </span>
                    </p>
                    <p className="text-xs break-words text-slate-500">{c.address}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Pedidos (${orders.length})`}>
            {orders.length === 0 ? (
              <span className="text-slate-400">Nenhum pedido ainda.</span>
            ) : (
              <ul className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/pedidos/${order.id}`)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                      <Badge variant={statusVariant(order)}>{statusLabel(order)}</Badge>
                      <span className="text-slate-600">
                        {formatBRL(order.totalPaidBRL)}
                      </span>
                      <span className="text-slate-500">
                        {formatDate(order.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
