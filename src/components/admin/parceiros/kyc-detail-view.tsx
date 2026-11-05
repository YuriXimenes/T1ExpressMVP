"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/lib/admin/access-provider";
import {
  PartnerError,
  fetchOnboarding,
  onboardingLink,
  renewOnboardingLink,
  reviewDocument,
  setOnboardingStatus,
  type Onboarding,
  type PartnerDocument,
} from "@/lib/partners/api";
import {
  DOC_LABELS,
  PARTNER_KIND_LABELS,
  formatCnpj,
  formatCpf,
  receivesPayment,
  requiredDocs,
} from "@/lib/partners/rules";
import { WEEKDAY_LABELS } from "@/lib/points/guard";
import {
  CopyLink,
  DocStatusBadge,
  DocThumb,
  OnboardingStatusBadge,
  shortDateTime,
} from "@/components/admin/parceiros/partner-ui";

const EVENT_LABELS: Record<string, string> = {
  criado: "Onboarding iniciado",
  link_renovado: "Link renovado",
  preenchendo: "Loja abriu o link",
  enviado: "Cadastro enviado para análise",
  documento: "Documento",
  pendencia: "Pendência apontada",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

type Action =
  { kind: "pendencia" | "recusado" | "aprovado" } | { kind: "doc"; doc: PartnerDocument };

const errorText = (err: unknown, fallback: string) =>
  err instanceof PartnerError ? err.message : fallback;

export function KycDetailView({ id }: { id: string }) {
  const canEdit = useCan("kyc", "edit");
  const [onb, setOnb] = useState<Onboarding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [text, setText] = useState("");
  const [expired, setExpired] = useState(false);

  async function load() {
    try {
      const o = await fetchOnboarding(id);
      setOnb(o);
      setExpired(new Date(o.tokenExpiresAt).getTime() < Date.now());
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar o cadastro."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      await load();
      setMessage(done);
      return true;
    } catch (err) {
      setError(errorText(err, "Não foi possível salvar."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!onb) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Carregando...</p>
        )}
      </div>
    );
  }

  const d = onb.data;
  const open = onb.status !== "aprovado" && onb.status !== "recusado";
  const docsByKind = (kind: string) => onb.documents.filter((doc) => doc.kind === kind);

  async function confirmAction() {
    if (!action || !onb) return;
    if (action.kind === "doc") {
      const ok = await run(
        () => reviewDocument(action.doc.id, "recusado", text.trim()),
        "Documento recusado.",
      );
      if (ok) setAction(null);
      return;
    }
    let storeCode: string | undefined;
    const ok = await run(
      async () => {
        const r = await setOnboardingStatus(
          onb.id,
          action.kind as never,
          text.trim() || undefined,
        );
        storeCode = r.storeCode;
      },
      action.kind === "aprovado"
        ? "Aprovado."
        : action.kind === "pendencia"
          ? "Pendência enviada para a loja."
          : "Cadastro recusado.",
    );
    if (ok) {
      setAction(null);
      if (storeCode)
        setMessage(
          `Aprovado. A loja ${storeCode} foi criada, oculta no site, e o responsável já tem acesso.`,
        );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900">
            {d.tradeName || "Cadastro sem nome"}
          </h1>
          <OnboardingStatusBadge status={onb.status} />
        </div>
        <p className="text-sm text-slate-500">
          {d.kind ? PARTNER_KIND_LABELS[d.kind] : "Tipo não informado"}
          {onb.userEmail && ` · conta ${onb.userEmail}`}
          {onb.submittedAt && ` · enviado ${shortDateTime(onb.submittedAt)}`}
        </p>
        {onb.storeCode && (
          <Link
            href={`/admin/parceiros/lojas/${onb.storeCode}`}
            className="text-brand-700 text-sm font-medium hover:underline"
          >
            Abrir a ficha da loja {onb.storeCode}
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}

      {open && onb.token && (
        <Card className="gap-2 p-4">
          <p className="text-sm font-medium text-slate-700">Link para a loja preencher</p>
          <CopyLink value={onboardingLink(onb.token)} label="Link de cadastro" />
          <p className="text-xs text-slate-500">
            {expired ? "Venceu em " : "Vale até "}
            {shortDateTime(onb.tokenExpiresAt)}. Envie pelo WhatsApp ou e-mail.
            {canEdit && (
              <button
                type="button"
                className="text-brand-700 ml-2 font-medium hover:underline"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => renewOnboardingLink(onb.id),
                    "Novo link gerado (o anterior deixou de valer).",
                  )
                }
              >
                Gerar novo link
              </button>
            )}
          </p>
        </Card>
      )}

      {onb.message && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <span className="font-medium">Mensagem para a loja:</span> {onb.message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <Card className="gap-3 p-5 text-sm">
            <h2 className="font-semibold text-slate-900">Dados da empresa</h2>
            <Grid
              rows={[
                ["Razão social", d.legalName],
                ["Nome da loja", d.tradeName],
                ["CNPJ", d.cnpj && formatCnpj(d.cnpj)],
                ["Responsável", d.responsibleName],
                ["CPF", d.responsibleCpf && formatCpf(d.responsibleCpf)],
                ["E-mail", d.responsibleEmail],
                ["Telefone", d.responsiblePhone],
                [
                  "Endereço",
                  [d.street, d.number, d.complement].filter(Boolean).join(", ") +
                    (d.neighborhood ? ` · ${d.neighborhood}` : "") +
                    (d.city ? ` · ${d.city}/${d.state ?? ""}` : ""),
                ],
                ["CEP", d.zip],
                ["Capacidade de guarda", d.capacity && `${d.capacity} pacotes`],
                ["Jogos", d.games?.join(", ")],
                ...(receivesPayment(d.kind)
                  ? ([
                      [
                        "Recebimento",
                        d.payout?.method === "pix"
                          ? `Pix: ${d.payout.pixKey}`
                          : d.payout?.method === "conta"
                            ? `${d.payout.bank} · ag. ${d.payout.agency} · conta ${d.payout.account}${d.payout.holder ? ` · ${d.payout.holder}` : ""}`
                            : undefined,
                      ],
                    ] as [string, string | undefined][])
                  : []),
                ["Termos", d.termsAccepted ? "Aceitos" : "Não aceitos"],
                ["Observações", d.notes],
              ]}
            />
            {d.hours && Object.values(d.hours).some((h) => h) && (
              <div>
                <p className="text-slate-500">Horário de atendimento</p>
                <ul className="mt-1 grid grid-cols-2 gap-x-4 text-slate-700 sm:grid-cols-4">
                  {WEEKDAY_LABELS.map((label, i) =>
                    d.hours?.[String(i)] ? (
                      <li key={label}>
                        {label.slice(0, 3)}: {d.hours[String(i)]}
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Documentos</h2>
            <ul className="flex flex-col gap-3">
              {requiredDocs(d.kind).map((req) => {
                const docs = docsByKind(req.kind);
                return (
                  <li
                    key={req.kind}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
                  >
                    <p className="text-sm font-medium text-slate-800">{req.label}</p>
                    {docs.length === 0 && (
                      <p className="text-xs text-slate-500">
                        {req.min > 0 ? "Ainda não enviado." : "Não enviado (opcional)."}
                      </p>
                    )}
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex flex-wrap items-center gap-3">
                        <DocThumb doc={doc} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-slate-600">{doc.name}</p>
                          <DocStatusBadge status={doc.status} />
                          {doc.reviewNote && (
                            <p className="mt-0.5 text-xs text-red-700">
                              {doc.reviewNote}
                            </p>
                          )}
                        </div>
                        {canEdit && open && (
                          <div className="flex gap-1.5">
                            {doc.status !== "aceito" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    () => reviewDocument(doc.id, "aceito"),
                                    "Documento aceito.",
                                  )
                                }
                              >
                                Aceitar
                              </Button>
                            )}
                            {doc.status !== "recusado" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                  setText("");
                                  setAction({ kind: "doc", doc });
                                }}
                              >
                                Recusar
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {canEdit && open && (
            <Card className="gap-3 p-5">
              <h2 className="font-semibold text-slate-900">Análise</h2>
              {onb.missing.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-medium">Falta no cadastro:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {onb.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {onb.status !== "em_analise" && (
                <p className="text-xs text-slate-500">
                  Aprovar e apontar pendência ficam disponíveis quando a loja enviar o
                  cadastro.
                </p>
              )}
              <Button
                disabled={busy || onb.status !== "em_analise"}
                onClick={() => {
                  setText("");
                  setAction({ kind: "aprovado" });
                }}
              >
                Aprovar
              </Button>
              <Button
                variant="outline"
                disabled={busy || onb.status !== "em_analise"}
                onClick={() => {
                  setText("");
                  setAction({ kind: "pendencia" });
                }}
              >
                Apontar pendência
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setText("");
                  setAction({ kind: "recusado" });
                }}
              >
                Recusar cadastro
              </Button>
            </Card>
          )}

          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">Histórico</h2>
            <ol className="flex flex-col gap-2 text-sm">
              {(onb.events ?? []).map((e, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-slate-800">{EVENT_LABELS[e.kind] ?? e.kind}</p>
                  {e.note && <p className="text-xs text-slate-600">{e.note}</p>}
                  <p className="text-xs text-slate-400">
                    {e.actorName ??
                      (e.actorKind === "store"
                        ? "Loja"
                        : e.actorKind === "admin"
                          ? "Equipe T1"
                          : "Sistema")}{" "}
                    · {shortDateTime(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <Dialog open={action !== null} onOpenChange={(o) => !o && !busy && setAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "aprovado"
                ? "Aprovar a loja?"
                : action?.kind === "pendencia"
                  ? "Apontar pendência"
                  : action?.kind === "recusado"
                    ? "Recusar o cadastro?"
                    : `Recusar documento${action?.kind === "doc" ? `: ${DOC_LABELS[action.doc.kind]}` : ""}`}
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "aprovado"
                ? "Cria a loja no cadastro, oculta no site até você publicar, e dá acesso à área da loja para quem preencheu."
                : action?.kind === "pendencia"
                  ? "A loja recebe a mensagem e pode corrigir e reenviar."
                  : action?.kind === "recusado"
                    ? "Encerra o cadastro. A loja vê o motivo."
                    : "A loja vê o motivo e envia outro arquivo."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            maxLength={2000}
            aria-label="Mensagem"
            placeholder={
              action?.kind === "aprovado"
                ? "Mensagem de boas-vindas (opcional)"
                : "Mensagem para a loja"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>
              Cancelar
            </Button>
            <Button
              variant={action?.kind === "recusado" ? "destructive" : "default"}
              disabled={busy || (action?.kind !== "aprovado" && text.trim().length < 3)}
              onClick={() => void confirmAction()}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grid({ rows }: { rows: [string, string | undefined | false][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500">{label}</dt>
          <dd className="break-words text-slate-800">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/parceiros/kyc"
      className="inline-flex items-center gap-1 self-start text-sm text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> KYC / Onboarding
    </Link>
  );
}
