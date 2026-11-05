"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Store, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  PartnerError,
  openOnboarding,
  previewOnboarding,
  removeOnboardingDoc,
  saveOnboarding,
  submitOnboarding,
  uploadOnboardingDoc,
  type Onboarding,
  type OnboardingData,
} from "@/lib/partners/api";
import {
  PARTNER_KIND_LABELS,
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
  receivesPayment,
  requiredDocs,
  validateOnboarding,
  type DocKind,
  type PartnerKind,
} from "@/lib/partners/rules";
import { WEEKDAY_LABELS } from "@/lib/points/guard";
import { cn } from "@/lib/utils";
import { DocStatusBadge, DocThumb } from "@/components/admin/parceiros/partner-ui";

const GAMES = [
  "Magic",
  "Pokémon",
  "Yu-Gi-Oh!",
  "Lorcana",
  "Flesh and Blood",
  "One Piece",
  "Outros",
];

const AUTOSAVE_MS = 1500;

const errorText = (err: unknown, fallback: string) =>
  err instanceof PartnerError ? err.message : fallback;

/** Mensagens de erro por id de campo (só aparecem depois de tentar enviar). */
const ErrorsContext = createContext<Record<string, string>>({});

/** Leva a tela até o campo e dá foco nele. */
function goTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

/** /parceiro/cadastro/<token>: a loja cria a conta, preenche dados e documentos e envia. */
export function PartnerOnboardingView({ token }: { token: string }) {
  const { isReady, isLoggedIn, user } = useAuth();
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof previewOnboarding>
  > | null>(null);
  const [onb, setOnb] = useState<Onboarding | null>(null);
  const [data, setData] = useState<OnboardingData>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">(
    "idle",
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // O formulário só é preenchido do banco UMA vez. Depois disso, o que a pessoa digitou
  // manda: recarregar (após anexar, remover ou salvar) nunca pode apagar o que está na tela.
  const loadedOnce = useRef(false);
  const version = useRef(0);
  const here = `/parceiro/cadastro/${token}`;

  async function load(initial = false) {
    try {
      const o = await openOnboarding(token);
      setOnb(o);
      if (initial) {
        setData({
          ...o.data,
          cnpj: o.data.cnpj ? formatCnpj(o.data.cnpj) : "",
          responsibleCpf: o.data.responsibleCpf ? formatCpf(o.data.responsibleCpf) : "",
          hours: o.data.hours ?? {},
          payout: o.data.payout ?? { method: "pix" },
          games: o.data.games ?? [],
        });
      }
    } catch (err) {
      if (initial) loadedOnce.current = false;
      setError(errorText(err, "Não foi possível abrir o cadastro."));
    }
  }

  useEffect(() => {
    let cancelled = false;
    previewOnboarding(token)
      .then((p) => !cancelled && setPreview(p))
      .catch(() => !cancelled && setPreview({ found: false }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!isReady || !isLoggedIn || !preview?.found || loadedOnce.current) return;
    loadedOnce.current = true;
    queueMicrotask(() => void load(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isLoggedIn, preview?.found]);

  const editable =
    onb?.status === "aguardando_preenchimento" || onb?.status === "pendencia";

  function set(patch: Partial<OnboardingData>) {
    version.current += 1;
    setData((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage(null);
  }

  // Salva o rascunho sozinho, um instante depois da última digitação.
  useEffect(() => {
    if (!dirty || !editable) return;
    const sent = version.current;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveOnboarding(token, data);
        if (version.current === sent) setDirty(false);
        setSaveState("saved");
        setSavedAt(new Date());
      } catch {
        setSaveState("failed");
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [data, dirty, editable, token]);

  // Avisa antes de fechar a aba com alterações ainda não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const issues = useMemo(
    () => validateOnboarding(data, onb?.documents ?? []),
    [data, onb?.documents],
  );
  const errors = useMemo(
    () => (showErrors ? Object.fromEntries(issues.map((i) => [i.id, i.message])) : {}),
    [showErrors, issues],
  );

  async function saveDraft() {
    setError(null);
    setSaveState("saving");
    const sent = version.current;
    try {
      await saveOnboarding(token, data);
      if (version.current === sent) setDirty(false);
      setSaveState("saved");
      setSavedAt(new Date());
      setMessage("Rascunho salvo.");
    } catch (err) {
      setSaveState("failed");
      setError(errorText(err, "Não foi possível salvar."));
    }
  }

  async function upload(kind: DocKind, files: FileList | null) {
    if (!files?.length || !onb) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files))
        await uploadOnboardingDoc(token, onb.id, kind, file);
      await load();
    } catch (err) {
      setError(errorText(err, "Não foi possível enviar o arquivo."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(docId: string) {
    setBusy(true);
    setError(null);
    try {
      await removeOnboardingDoc(token, docId);
      await load();
    } catch (err) {
      setError(errorText(err, "Não foi possível remover."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);
    setMessage(null);
    if (issues.length > 0) {
      // Nada é enviado nem apagado: só mostra o que falta e leva até o primeiro item.
      setShowErrors(true);
      goTo(issues[0].id);
      return;
    }
    setBusy(true);
    try {
      await saveOnboarding(token, data);
      setDirty(false);
      await submitOnboarding(token);
      await load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(errorText(err, "Não foi possível enviar."));
    } finally {
      setBusy(false);
    }
  }

  // --- Antes de abrir -----------------------------------------------------------------
  if (!preview || !isReady)
    return <p className="text-center text-slate-500">Carregando...</p>;
  if (!preview.found) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <p className="text-slate-700">
          Link de cadastro não encontrado. Confira o endereço.
        </p>
      </Card>
    );
  }
  if (!isLoggedIn) {
    return (
      <Card className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <Store className="text-brand-700 mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-lg font-semibold text-slate-900">
              Cadastro de parceiro T1 Express
              {preview.tradeName && ` · ${preview.tradeName}`}
            </p>
            <p className="text-sm text-slate-600">
              {preview.expired
                ? "Este link expirou. Peça um novo para a equipe T1 Express."
                : "Para preencher, entre na sua conta ou crie uma. Ela vai ser o acesso da loja depois da aprovação."}
            </p>
          </div>
        </div>
        {!preview.expired && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href={`/criar-conta?next=${encodeURIComponent(here)}`}>
                Criar conta
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/login?next=${encodeURIComponent(here)}`}>Já tenho conta</Link>
            </Button>
          </div>
        )}
      </Card>
    );
  }
  if (!onb) {
    return error ? (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <p role="alert" className="text-slate-700">
          {error}
        </p>
      </Card>
    ) : (
      <p className="text-center text-slate-500">Carregando...</p>
    );
  }

  // --- Status fora do preenchimento ----------------------------------------------------
  if (
    onb.status === "em_analise" ||
    onb.status === "aprovado" ||
    onb.status === "recusado"
  ) {
    return (
      <Card className="mx-auto flex max-w-lg flex-col items-center gap-3 p-6 text-center">
        {onb.status === "aprovado" ? (
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden="true" />
        ) : (
          <Clock className="h-10 w-10 text-slate-400" aria-hidden="true" />
        )}
        <p className="text-lg font-semibold text-slate-900">
          {onb.status === "em_analise"
            ? "Cadastro enviado. Estamos analisando."
            : onb.status === "aprovado"
              ? "Cadastro aprovado. Boas-vindas à T1 Express!"
              : "Cadastro não aprovado"}
        </p>
        <p className="text-sm text-slate-600">
          {onb.status === "em_analise"
            ? "Você recebe a resposta por aqui. Se faltar algo, este link volta a ficar disponível para corrigir."
            : onb.message ||
              (onb.status === "aprovado" ? "Sua área da loja já está liberada." : "")}
        </p>
        {onb.status === "aprovado" && (
          <Button asChild size="lg">
            <Link href="/loja">Abrir a área da loja</Link>
          </Button>
        )}
      </Card>
    );
  }

  const docs = requiredDocs(data.kind);
  const cnpjLive =
    onlyDigits(data.cnpj ?? "").length === 14 && !isValidCnpj(data.cnpj ?? "");
  const cpfLive =
    onlyDigits(data.responsibleCpf ?? "").length === 11 &&
    !isValidCpf(data.responsibleCpf ?? "");
  const isPickup = receivesPayment(data.kind);
  const ring = (id: string) =>
    errors[id] ? "rounded-lg ring-2 ring-red-300 ring-offset-2 outline-none" : "";

  const saveLabel =
    saveState === "saving"
      ? "Salvando..."
      : saveState === "failed"
        ? "Não foi possível salvar o rascunho agora. Tentaremos de novo."
        : dirty
          ? "Alterações ainda não salvas"
          : savedAt
            ? `Rascunho salvo às ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "";

  return (
    <ErrorsContext.Provider value={errors}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Cadastro de parceiro</h1>
          <p className="text-sm text-slate-600">
            Conta: {user?.email}. Preencha, envie os documentos e mande para análise. O
            rascunho é salvo sozinho e dá para continuar depois pelo mesmo link.
          </p>
          <p
            aria-live="polite"
            className={cn(
              "mt-1 text-xs",
              saveState === "failed" ? "text-red-600" : "text-slate-400",
            )}
          >
            {saveLabel}
          </p>
        </div>

        {onb.status === "pendencia" && onb.message && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">A T1 Express pediu um ajuste:</p>
            <p className="mt-1 whitespace-pre-wrap">{onb.message}</p>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {showErrors && issues.length > 0 && <IssuesSummary issues={issues} />}

        <fieldset disabled={!editable} className="flex flex-col gap-5">
          <Section title="1. Empresa">
            <Field label="Razão social" id="ob-legal">
              <Input
                id="ob-legal"
                maxLength={200}
                value={data.legalName ?? ""}
                onChange={(e) => set({ legalName: e.target.value })}
              />
            </Field>
            <Field label="Nome da loja (como o cliente conhece)" id="ob-trade">
              <Input
                id="ob-trade"
                maxLength={200}
                value={data.tradeName ?? ""}
                onChange={(e) => set({ tradeName: e.target.value })}
              />
            </Field>
            <Field
              label="CNPJ"
              id="ob-cnpj"
              error={cnpjLive ? "CNPJ inválido." : undefined}
            >
              <Input
                id="ob-cnpj"
                inputMode="numeric"
                value={data.cnpj ?? ""}
                onChange={(e) => set({ cnpj: formatCnpj(e.target.value) })}
              />
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Tipo de parceria</Label>
              <div
                id="ob-kind"
                tabIndex={-1}
                className={cn("flex flex-wrap gap-2 p-1", ring("ob-kind"))}
                role="group"
                aria-label="Tipo de parceria"
              >
                {(["coleta", "retirada", "ambos"] as PartnerKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={data.kind === k}
                    onClick={() => set({ kind: k })}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium",
                      data.kind === k
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600",
                    )}
                  >
                    {PARTNER_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <GroupError id="ob-kind" />
              <p className="text-xs text-slate-500">
                Ponto de retirada precisa ter local físico com acesso para os clientes
                buscarem os pedidos. Só pontos de retirada recebem da T1, por isso pedem
                dados de recebimento e fotos do local.
              </p>
            </div>
          </Section>

          <Section title="2. Responsável">
            <Field label="Nome completo" id="ob-resp">
              <Input
                id="ob-resp"
                maxLength={200}
                value={data.responsibleName ?? ""}
                onChange={(e) => set({ responsibleName: e.target.value })}
              />
            </Field>
            <Field label="CPF" id="ob-cpf" error={cpfLive ? "CPF inválido." : undefined}>
              <Input
                id="ob-cpf"
                inputMode="numeric"
                value={data.responsibleCpf ?? ""}
                onChange={(e) => set({ responsibleCpf: formatCpf(e.target.value) })}
              />
            </Field>
            <Field label="E-mail" id="ob-email">
              <Input
                id="ob-email"
                type="email"
                maxLength={200}
                value={data.responsibleEmail ?? ""}
                onChange={(e) => set({ responsibleEmail: e.target.value })}
              />
            </Field>
            <Field label="Telefone / WhatsApp" id="ob-phone">
              <Input
                id="ob-phone"
                inputMode="tel"
                maxLength={30}
                value={data.responsiblePhone ?? ""}
                onChange={(e) => set({ responsiblePhone: e.target.value })}
              />
            </Field>
          </Section>

          <Section title="3. Endereço e atendimento">
            <Field label="Rua" id="ob-street">
              <Input
                id="ob-street"
                maxLength={200}
                value={data.street ?? ""}
                onChange={(e) => set({ street: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número" id="ob-number">
                <Input
                  id="ob-number"
                  maxLength={20}
                  value={data.number ?? ""}
                  onChange={(e) => set({ number: e.target.value })}
                />
              </Field>
              <Field label="Complemento (opcional)" id="ob-compl">
                <Input
                  id="ob-compl"
                  maxLength={200}
                  value={data.complement ?? ""}
                  onChange={(e) => set({ complement: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Bairro (opcional)" id="ob-neigh">
              <Input
                id="ob-neigh"
                maxLength={120}
                value={data.neighborhood ?? ""}
                onChange={(e) => set({ neighborhood: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-[1fr_80px_120px] gap-3">
              <Field label="Cidade" id="ob-city">
                <Input
                  id="ob-city"
                  maxLength={120}
                  value={data.city ?? ""}
                  onChange={(e) => set({ city: e.target.value })}
                />
              </Field>
              <Field label="UF" id="ob-uf">
                <Input
                  id="ob-uf"
                  maxLength={2}
                  value={data.state ?? ""}
                  onChange={(e) => set({ state: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label="CEP (opcional)" id="ob-zip">
                <Input
                  id="ob-zip"
                  inputMode="numeric"
                  maxLength={9}
                  value={data.zip ?? ""}
                  onChange={(e) => set({ zip: e.target.value })}
                />
              </Field>
            </div>
            {isPickup && (
              <>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label>Horário de atendimento ao público</Label>
                  <div
                    id="ob-hours"
                    tabIndex={-1}
                    className={cn("grid gap-2 p-1 sm:grid-cols-2", ring("ob-hours"))}
                  >
                    {WEEKDAY_LABELS.map((label, i) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-20 text-sm text-slate-600">{label}</span>
                        <Input
                          aria-label={`Horário de ${label}`}
                          className="h-8 text-sm"
                          placeholder="ex.: 10:00–19:00 (vazio = fechado)"
                          maxLength={40}
                          value={data.hours?.[String(i)] ?? ""}
                          onChange={(e) =>
                            set({ hours: { ...data.hours, [String(i)]: e.target.value } })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <GroupError id="ob-hours" />
                </div>
                <Field
                  label="Quantos pacotes consegue guardar ao mesmo tempo (opcional)"
                  id="ob-cap"
                >
                  <Input
                    id="ob-cap"
                    inputMode="numeric"
                    maxLength={5}
                    value={data.capacity ?? ""}
                    onChange={(e) => set({ capacity: e.target.value.replace(/\D/g, "") })}
                  />
                </Field>
              </>
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Jogos com que a loja trabalha (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {GAMES.map((g) => {
                  const on = data.games?.includes(g) ?? false;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          games: on
                            ? data.games?.filter((x) => x !== g)
                            : [...(data.games ?? []), g],
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm",
                        on
                          ? "border-brand-600 bg-brand-50 text-brand-700"
                          : "border-slate-200 text-slate-600",
                      )}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          {isPickup && (
            <Section title="4. Recebimento">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <div
                  id="ob-payout"
                  tabIndex={-1}
                  className={cn("flex gap-2 p-1", ring("ob-payout"))}
                  role="group"
                  aria-label="Forma de recebimento"
                >
                  {(["pix", "conta"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={data.payout?.method === m}
                      onClick={() => set({ payout: { ...data.payout, method: m } })}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium",
                        data.payout?.method === m
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-600",
                      )}
                    >
                      {m === "pix" ? "Chave Pix no CNPJ" : "Conta bancária PJ"}
                    </button>
                  ))}
                </div>
                <GroupError id="ob-payout" />
                <p className="text-xs text-slate-500">
                  A T1 paga no 5º dia útil do mês seguinte. A conta precisa estar no nome
                  da empresa.
                </p>
              </div>
              {data.payout?.method === "pix" ? (
                <Field label="Chave Pix" id="ob-pix">
                  <Input
                    id="ob-pix"
                    maxLength={120}
                    value={data.payout?.pixKey ?? ""}
                    onChange={(e) =>
                      set({ payout: { ...data.payout, pixKey: e.target.value } })
                    }
                  />
                </Field>
              ) : data.payout?.method === "conta" ? (
                <>
                  <Field label="Banco" id="ob-bank">
                    <Input
                      id="ob-bank"
                      maxLength={120}
                      value={data.payout?.bank ?? ""}
                      onChange={(e) =>
                        set({ payout: { ...data.payout, bank: e.target.value } })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Agência" id="ob-ag">
                      <Input
                        id="ob-ag"
                        maxLength={20}
                        value={data.payout?.agency ?? ""}
                        onChange={(e) =>
                          set({ payout: { ...data.payout, agency: e.target.value } })
                        }
                      />
                    </Field>
                    <Field label="Conta" id="ob-acc">
                      <Input
                        id="ob-acc"
                        maxLength={30}
                        value={data.payout?.account ?? ""}
                        onChange={(e) =>
                          set({ payout: { ...data.payout, account: e.target.value } })
                        }
                      />
                    </Field>
                  </div>
                </>
              ) : null}
            </Section>
          )}

          <Card className="gap-4 p-5" id="ob-docs">
            <h2 className="font-semibold text-slate-900">
              {isPickup ? "5" : "4"}. Documentos
            </h2>
            <p className="text-sm text-slate-600">
              Fotos legíveis ou PDF. Só pedimos o necessário para confirmar a empresa
              {isPickup ? " e onde pagar" : ""}.
            </p>
            {!data.kind && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Falta escolher o{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => goTo("ob-kind")}
                >
                  tipo de parceria
                </button>
                . Ponto de retirada envia também o comprovante da conta ou do Pix e as
                fotos do local, que só aparecem aqui depois da escolha.
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {docs.map((req) => {
                const mine = onb.documents.filter((d) => d.kind === req.kind);
                const id = `ob-doc-${req.kind}`;
                return (
                  <li
                    key={req.kind}
                    id={id}
                    tabIndex={-1}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border border-slate-200 p-3",
                      errors[id] && "border-red-400 ring-2 ring-red-200 outline-none",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{req.label}</p>
                        <p className="text-xs text-slate-500">{req.hint}</p>
                      </div>
                      {editable && (
                        <label
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50",
                            busy && "pointer-events-none opacity-50",
                          )}
                        >
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          {busy ? "Enviando..." : "Enviar"}
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            multiple={req.kind === "foto_local"}
                            disabled={busy}
                            className="hidden"
                            onChange={(e) => {
                              void upload(req.kind, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {errors[id] && (
                      <p className="text-xs font-medium text-red-600">{errors[id]}</p>
                    )}
                    {mine.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3">
                        <DocThumb doc={doc} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-slate-600">{doc.name}</p>
                          <DocStatusBadge status={doc.status} />
                          {doc.reviewNote && (
                            <p className="text-xs text-red-700">{doc.reviewNote}</p>
                          )}
                        </div>
                        {editable && doc.status !== "aceito" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            aria-label="Remover arquivo"
                            onClick={() => void remove(doc.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="font-semibold text-slate-900">
              {isPickup ? "6" : "5"}. Revisão e envio
            </h2>
            <Field label="Observações (opcional)" id="ob-notes">
              <Textarea
                id="ob-notes"
                rows={2}
                maxLength={1000}
                value={data.notes ?? ""}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
            <div className="flex flex-col gap-1">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  id="ob-terms"
                  type="checkbox"
                  className={cn(
                    "accent-brand-600 mt-0.5 h-4 w-4",
                    errors["ob-terms"] && "outline-2 outline-offset-2 outline-red-400",
                  )}
                  checked={data.termsAccepted ?? false}
                  onChange={(e) => set({ termsAccepted: e.target.checked })}
                />
                Li e aceito os termos de parceria da T1 Express e autorizo a análise dos
                documentos enviados.
              </label>
              <GroupError id="ob-terms" />
            </div>
            {showErrors && issues.length > 0 && <IssuesSummary issues={issues} />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void saveDraft()}>
                Salvar rascunho
              </Button>
              <Button type="button" disabled={busy} onClick={() => void submit()}>
                {busy ? "Enviando..." : "Enviar para análise"}
              </Button>
            </div>
          </Card>
        </fieldset>
      </div>
    </ErrorsContext.Provider>
  );
}

/** Lista do que falta; cada item leva a tela até o campo. */
function IssuesSummary({ issues }: { issues: { id: string; label: string }[] }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        Falta preencher {issues.length} {issues.length === 1 ? "item" : "itens"} para
        enviar
      </p>
      <p className="mt-1 text-xs text-red-800">
        Nada foi perdido. Toque em um item para ir até ele.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              onClick={() => goTo(issue.id)}
              className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
            >
              {issue.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupError({ id }: { id: string }) {
  const errors = useContext(ErrorsContext);
  return errors[id] ? (
    <p className="text-xs font-medium text-red-600">{errors[id]}</p>
  ) : null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-4 p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
}) {
  const errors = useContext(ErrorsContext);
  const message = error ?? errors[id];
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        message && "[&_input]:border-red-500 [&_input]:ring-2 [&_input]:ring-red-200",
      )}
    >
      <Label htmlFor={id}>{label}</Label>
      {children}
      {message && <p className="text-xs font-medium text-red-600">{message}</p>}
    </div>
  );
}
