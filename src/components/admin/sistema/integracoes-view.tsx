"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/admin/survey-charts";
import {
  CsvButton,
  count,
  dateTimeBR,
  td,
} from "@/components/admin/plataforma/metrics-ui";
import { useCan } from "@/lib/admin/access-provider";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  SystemError,
  fetchErrors,
  fetchSystemHealth,
  resolveError,
  type AppErrorRow,
  type SystemHealth,
} from "@/lib/system/api";
import { reportError } from "@/lib/system/errors";
import { cn } from "@/lib/utils";

/** Migração que este código espera no banco. */
const EXPECTED_SCHEMA = "0026";
const BUCKETS = ["order-photos", "partner-docs", "finance-docs"];

type CheckState = "checando" | "ok" | "atencao" | "falha" | "info";
interface Check {
  id: string;
  name: string;
  state: CheckState;
  detail: string;
}

const STATE_UI: Record<CheckState, { label: string; tone: string }> = {
  checando: { label: "Testando...", tone: "border-slate-200 text-slate-500" },
  ok: { label: "Funcionando", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  atencao: { label: "Atenção", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  falha: { label: "Fora do ar", tone: "border-red-200 bg-red-50 text-red-700" },
  info: { label: "Informativo", tone: "border-slate-200 bg-slate-50 text-slate-600" },
};

const SOURCE_LABELS = { site: "Site", admin: "Admin", server: "Servidor" } as const;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

function loadImage(src: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("erro"));
    };
    img.src = `${src}?t=${Date.now()}`;
  });
}

export interface DeployInfo {
  env?: string;
  commit?: string;
  branch?: string;
  message?: string;
}

/** Sistema › Integrações: situação dos serviços e erros do site, do admin e do servidor. */
export function IntegracoesView({ deploy }: { deploy: DeployInfo }) {
  const canEdit = useCan("integracoes", "edit");
  const [checks, setChecks] = useState<Check[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [errors, setErrors] = useState<AppErrorRow[] | null>(null);
  const [errorsFailed, setErrorsFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<"aberto" | "resolvido" | "todos">("aberto");
  const [openId, setOpenId] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");

  const runChecks = useCallback(async () => {
    const base: Check[] = [
      { id: "db", name: "Supabase · banco de dados", state: "checando", detail: "" },
      { id: "auth", name: "Supabase · login", state: "checando", detail: "" },
      { id: "storage", name: "Supabase · arquivos", state: "checando", detail: "" },
      { id: "cep", name: "ViaCEP · endereço pelo CEP", state: "checando", detail: "" },
      { id: "maps", name: "OpenStreetMap · mapas", state: "checando", detail: "" },
    ];
    setChecks(base);
    const set = (id: string, state: CheckState, detail: string) =>
      setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, state, detail } : c)));

    void timed(fetchSystemHealth)
      .then(({ value, ms }) => {
        setHealth(value);
        const behind = value.schemaVersion < EXPECTED_SCHEMA;
        set(
          "db",
          behind ? "atencao" : ms > 1500 ? "atencao" : "ok",
          behind
            ? `Banco na versão ${value.schemaVersion}; o site espera ${EXPECTED_SCHEMA}. Aplique a migração que falta.`
            : `Respondeu em ${ms} ms · versão do banco ${value.schemaVersion}`,
        );
        const missing = BUCKETS.filter((b) => !value.buckets.includes(b));
        set(
          "storage",
          missing.length ? "atencao" : "ok",
          missing.length
            ? `Faltam as pastas: ${missing.join(", ")}`
            : `${value.buckets.length} pastas de arquivos (${BUCKETS.join(", ")})`,
        );
      })
      .catch((err) => {
        const msg = err instanceof SystemError ? err.message : "Sem resposta do banco.";
        set("db", "falha", msg);
        set("storage", "falha", "Não foi possível consultar.");
      });

    void timed(() => createBrowserClient().auth.getSession())
      .then(({ value, ms }) =>
        value.error
          ? set("auth", "falha", value.error.message)
          : set("auth", "ok", `Sessão válida · ${ms} ms`),
      )
      .catch(() => set("auth", "falha", "Sem resposta do serviço de login."));

    void timed(() =>
      fetch("https://viacep.com.br/ws/01001000/json/", {
        signal: AbortSignal.timeout(6000),
      }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }),
    )
      .then(({ ms }) => set("cep", "ok", `Respondeu em ${ms} ms`))
      .catch(() =>
        set(
          "cep",
          "falha",
          "Sem resposta. O preenchimento automático de endereço não funciona.",
        ),
      );

    void timed(() => loadImage("https://a.tile.openstreetmap.fr/hot/0/0/0.png"))
      .then(({ ms }) => set("maps", "ok", `Mapa carregou em ${ms} ms`))
      .catch(() => set("maps", "falha", "Os mapas (pontos de retirada) não carregam."));

    setCheckedAt(
      new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    );
  }, []);

  const loadErrors = useCallback(() => {
    fetchErrors()
      .then((list) => {
        setErrors(list);
        setErrorsFailed(null);
      })
      .catch((err) =>
        setErrorsFailed(
          err instanceof SystemError ? err.message : "Não foi possível carregar.",
        ),
      );
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void runChecks();
      loadErrors();
    });
  }, [runChecks, loadErrors]);

  async function sendTest() {
    await reportError({
      source: "admin",
      message: "Erro de teste enviado pela tela Integrações",
      stack: "Error: Erro de teste\n    at IntegracoesView (integracoes-view.tsx)",
      path: window.location.pathname,
      userAgent: navigator.userAgent,
    });
    setTestSent(true);
    loadErrors();
  }

  async function resolve(id: string) {
    try {
      await resolveError(id);
      loadErrors();
    } catch (err) {
      setErrorsFailed(
        err instanceof SystemError ? err.message : "Não foi possível resolver.",
      );
    }
  }

  const visible = (errors ?? []).filter((e) => tab === "todos" || e.status === tab);
  const info: Check[] = [
    {
      id: "deploy",
      name: "Vercel · versão publicada",
      state: "info",
      detail: deploy.commit
        ? `${deploy.env === "production" ? "Produção" : (deploy.env ?? "")} · ${deploy.commit.slice(0, 7)}${deploy.branch ? ` (${deploy.branch})` : ""}${deploy.message ? ` · ${deploy.message.split("\n")[0].slice(0, 80)}` : ""}`
        : "Rodando fora da Vercel (localhost).",
    },
    {
      id: "email",
      name: "E-mail",
      state: "info",
      detail:
        "Só os e-mails de login e senha do Supabase. Avisos ficam no sino do admin.",
    },
    {
      id: "payment",
      name: "Pagamento",
      state: "info",
      detail:
        "Simulado (sem gateway): o cliente escolhe o método e o pedido é marcado como pago.",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Integrações</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Situação dos serviços que o site usa, testados agora pelo seu navegador, e os
            erros que clientes e equipe encontraram.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void runChecks()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Testar de novo
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Erros em aberto"
          value={health ? count(health.openErrors) : "—"}
        />
        <StatTile
          label="Ocorrências de erro em 24 h"
          value={health ? count(health.errors24h) : "—"}
        />
        <StatTile
          label="Ações auditadas hoje"
          value={health ? count(health.auditToday) : "—"}
        />
        <StatTile
          label="Simulações em 7 dias"
          value={health ? count(health.simulations7d) : "—"}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-slate-900">
          Serviços{" "}
          {checkedAt && (
            <span className="text-xs font-normal text-slate-500">
              testados às {checkedAt}
            </span>
          )}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {[...checks, ...info].map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{c.name}</p>
                {c.detail && <p className="text-xs text-slate-500">{c.detail}</p>}
              </div>
              <span
                className={cn(
                  "inline-flex w-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
                  STATE_UI[c.state].tone,
                )}
              >
                {STATE_UI[c.state].label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Erros</h2>
          <div className="flex flex-wrap items-center gap-2">
            {testSent && (
              <span className="text-xs text-emerald-700">Erro de teste enviado.</span>
            )}
            <Button size="sm" variant="outline" onClick={() => void sendTest()}>
              Enviar erro de teste
            </Button>
            <CsvButton
              filename="erros.csv"
              header={[
                "Origem",
                "Mensagem",
                "Página",
                "Ocorrências",
                "Primeira vez",
                "Última vez",
                "Situação",
              ]}
              rows={visible.map((e) => [
                SOURCE_LABELS[e.source],
                e.message,
                e.path,
                e.occurrences,
                e.firstSeen,
                e.lastSeen,
                e.status,
              ])}
            />
          </div>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Situação dos erros">
          {(
            [
              ["aberto", "Em aberto"],
              ["resolvido", "Resolvidos"],
              ["todos", "Todos"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium",
                tab === t
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}{" "}
              <span className="opacity-70">
                {(errors ?? []).filter((e) => t === "todos" || e.status === t).length}
              </span>
            </button>
          ))}
        </div>
        {errorsFailed && <p className="text-sm text-red-600">{errorsFailed}</p>}
        {!errors && !errorsFailed && (
          <p className="text-sm text-slate-500">Carregando...</p>
        )}
        {errors && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Erro</th>
                  <th className="px-3 py-2 text-right font-medium">Vezes</th>
                  <th className="px-3 py-2 font-medium">Última vez</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                      {tab === "aberto" ? "Nenhum erro em aberto." : "Nada por aqui."}
                    </td>
                  </tr>
                )}
                {visible.map((e) => {
                  const expanded = openId === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr className={cn(expanded && "bg-slate-50")}>
                        <td className={td}>
                          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span className="rounded border border-slate-200 bg-white px-1.5 font-medium text-slate-600">
                              {SOURCE_LABELS[e.source]}
                            </span>
                            {e.path}
                            {e.reopened && (
                              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 font-medium text-amber-700">
                                voltou depois de resolvido
                              </span>
                            )}
                            {e.status === "resolvido" && (
                              <span className="text-emerald-700">
                                resolvido
                                {e.resolvedByName ? ` por ${e.resolvedByName}` : ""}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 break-words text-slate-900">{e.message}</p>
                        </td>
                        <td className={`${td} text-right tabular-nums`}>
                          {count(e.occurrences)}
                        </td>
                        <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>
                          {dateTimeBR(e.lastSeen)}
                        </td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          {canEdit && e.status === "aberto" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void resolve(e.id)}
                            >
                              Resolvido
                            </Button>
                          )}
                          <button
                            type="button"
                            aria-label={expanded ? "Fechar detalhe" : "Ver detalhe"}
                            aria-expanded={expanded}
                            onClick={() => setOpenId(expanded ? null : e.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition-transform",
                                expanded && "rotate-180",
                              )}
                              aria-hidden="true"
                            />
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50">
                          <td
                            colSpan={4}
                            className="border-t border-slate-100 px-3 py-3 text-xs"
                          >
                            <p className="text-slate-500">
                              Primeira vez {dateTimeBR(e.firstSeen)}
                              {e.userAgent && ` · ${e.userAgent}`}
                            </p>
                            {e.stack ? (
                              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-100">
                                {e.stack}
                              </pre>
                            ) : (
                              <p className="mt-2 text-slate-500">
                                Sem pilha de chamadas.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
