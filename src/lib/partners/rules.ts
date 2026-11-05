import { addDays } from "@/lib/operating-calendar";
import { isBusinessDay } from "@/lib/occurrences/rules";

/** Regras de parceiros e KYC (espelho da 0020_partners.sql). */

export type PartnerKind = "coleta" | "retirada" | "ambos";
export type OnboardingStatus =
  "aguardando_preenchimento" | "em_analise" | "pendencia" | "aprovado" | "recusado";
export type DocKind =
  | "cnpj"
  | "contrato_social"
  | "doc_responsavel"
  | "comprovante_endereco"
  | "comprovante_bancario"
  | "foto_local"
  | "alvara";
export type DocStatus = "pendente" | "aceito" | "recusado";
export type StorePayRuleKind =
  "por_retirada" | "por_coleta" | "por_pacote_dia" | "percentual_frete" | "bonus_mensal";

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  coleta: "Coleta",
  retirada: "Ponto de retirada",
  ambos: "Coleta e ponto de retirada",
};

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  aguardando_preenchimento: "Aguardando preenchimento",
  em_analise: "Em análise",
  pendencia: "Pendência",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export const ONBOARDING_STATUSES = Object.keys(
  ONBOARDING_STATUS_LABELS,
) as OnboardingStatus[];

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pendente: "Em análise",
  aceito: "Aceito",
  recusado: "Recusado",
};

export interface DocRequirement {
  kind: DocKind;
  label: string;
  hint: string;
  /** Quantos arquivos, no mínimo (0 = opcional). */
  min: number;
}

/** Documentos pedidos no KYC. Fotos do local só para quem será ponto de retirada. */
export function requiredDocs(kind: PartnerKind | undefined): DocRequirement[] {
  const docs: DocRequirement[] = [
    {
      kind: "cnpj",
      label: "Cartão CNPJ (ou CCMEI, se MEI)",
      hint: "Emitido no site da Receita Federal.",
      min: 1,
    },
    {
      kind: "contrato_social",
      label: "Contrato social (última alteração) ou CCMEI",
      hint: "Mostra quem responde pela empresa.",
      min: 1,
    },
    {
      kind: "doc_responsavel",
      label: "Documento com foto do responsável",
      hint: "RG ou CNH, frente e verso.",
      min: 1,
    },
    {
      kind: "comprovante_endereco",
      label: "Comprovante de endereço da loja",
      hint: "Conta de luz, água ou internet dos últimos 90 dias.",
      min: 1,
    },
  ];
  // Só ponto de retirada recebe da T1: coleta pura não envia comprovante bancário.
  if (kind === "retirada" || kind === "ambos") {
    docs.push({
      kind: "comprovante_bancario",
      label: "Comprovante da conta PJ ou da chave Pix",
      hint: "Print do app do banco com o nome da empresa.",
      min: 1,
    });
    docs.push({
      kind: "foto_local",
      label: "Fotos do local (2 ou mais)",
      hint: "Fachada e área de atendimento: o cliente precisa conseguir entrar para retirar.",
      min: 2,
    });
  }
  docs.push({
    kind: "alvara",
    label: "Alvará de funcionamento (opcional)",
    hint: "Se a loja tiver.",
    min: 0,
  });
  return docs;
}

export const DOC_LABELS: Record<DocKind, string> = Object.fromEntries(
  requiredDocs("ambos").map((d) => [d.kind, d.label]),
) as Record<DocKind, string>;

/** Só ponto de retirada (retirada ou ambos) recebe da T1. */
export const receivesPayment = (kind: PartnerKind | undefined) =>
  kind === "retirada" || kind === "ambos";

export const STORE_PAY_RULES: { id: StorePayRuleKind; label: string; unit: string }[] = [
  { id: "por_retirada", label: "Por pedido retirado no ponto", unit: "R$ por retirada" },
  { id: "por_coleta", label: "Por pedido coletado na loja", unit: "R$ por pedido" },
  {
    id: "por_pacote_dia",
    label: "Por pacote guardado por dia",
    unit: "R$ por pacote/dia",
  },
  { id: "percentual_frete", label: "% do frete dos pedidos retirados", unit: "%" },
  { id: "bonus_mensal", label: "Bônus mensal fixo", unit: "R$ por mês" },
];

export const storePayRuleLabel = (kind: string) =>
  STORE_PAY_RULES.find((r) => r.id === kind)?.label ?? kind;

/** n-ésimo dia útil (seg a sex, sem feriado) do mês de `monthKey` ("AAAA-MM"). */
export function nthBusinessDay(monthKey: string, n: number): string {
  let day = addDays(`${monthKey}-01`, -1);
  let count = 0;
  while (count < n) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) count++;
  }
  return day;
}

/** "2026-10" → "outubro de 2026". */
export function monthLabel(monthKey: string): string {
  const text = new Date(`${monthKey}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

/** CPF com dígitos verificadores (igual a `_valid_cpf`). */
export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** CNPJ com dígitos verificadores (igual a `_valid_cnpj`). */
export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (weights: number[]) => {
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return (
    calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) &&
    calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13])
  );
}

export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Campos do formulário de cadastro que entram na validação (subconjunto de OnboardingData). */
export interface OnboardingFormData {
  legalName?: string;
  tradeName?: string;
  cnpj?: string;
  responsibleName?: string;
  responsibleCpf?: string;
  responsibleEmail?: string;
  responsiblePhone?: string;
  street?: string;
  number?: string;
  city?: string;
  state?: string;
  kind?: PartnerKind;
  hours?: Record<string, string>;
  payout?: {
    method?: "pix" | "conta" | "";
    pixKey?: string;
    bank?: string;
    agency?: string;
    account?: string;
  };
  termsAccepted?: boolean;
}

/** Um item obrigatório que falta: `id` é o do campo na tela (para rolar até ele). */
export interface OnboardingIssue {
  id: string;
  label: string;
  message: string;
}

const blank = (v: string | undefined) => (v ?? "").trim() === "";

/**
 * Tudo o que falta para enviar o cadastro, na ordem da tela. Espelho de
 * `_onboarding_missing` (0020/0021): o banco recusa o mesmo que aqui.
 */
export function validateOnboarding(
  d: OnboardingFormData,
  documents: { kind: string; status: string }[],
): OnboardingIssue[] {
  const out: OnboardingIssue[] = [];
  const add = (id: string, label: string, message = "Preencha este campo.") =>
    out.push({ id, label, message });

  if (blank(d.legalName)) add("ob-legal", "Razão social");
  if (blank(d.tradeName)) add("ob-trade", "Nome da loja");
  if (!isValidCnpj(d.cnpj ?? "")) {
    add("ob-cnpj", "CNPJ", blank(d.cnpj) ? "Preencha este campo." : "CNPJ inválido.");
  }
  if (!d.kind) add("ob-kind", "Tipo de parceria", "Escolha o tipo de parceria.");
  if (blank(d.responsibleName)) add("ob-resp", "Nome do responsável");
  if (!isValidCpf(d.responsibleCpf ?? "")) {
    add(
      "ob-cpf",
      "CPF do responsável",
      blank(d.responsibleCpf) ? "Preencha este campo." : "CPF inválido.",
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((d.responsibleEmail ?? "").trim())) {
    add(
      "ob-email",
      "E-mail do responsável",
      blank(d.responsibleEmail) ? "Preencha este campo." : "E-mail inválido.",
    );
  }
  if (onlyDigits(d.responsiblePhone ?? "").length < 10) {
    add(
      "ob-phone",
      "Telefone do responsável",
      blank(d.responsiblePhone) ? "Preencha este campo." : "Informe com DDD.",
    );
  }
  if (blank(d.street)) add("ob-street", "Rua");
  if (blank(d.number)) add("ob-number", "Número");
  if (blank(d.city)) add("ob-city", "Cidade");
  if (!/^[A-Za-z]{2}$/.test((d.state ?? "").trim())) {
    add("ob-uf", "UF", "Use as 2 letras do estado, ex.: RJ.");
  }

  if (receivesPayment(d.kind)) {
    if (!Object.values(d.hours ?? {}).some((h) => !blank(h))) {
      add(
        "ob-hours",
        "Horário de atendimento",
        "Informe o horário de pelo menos um dia da semana.",
      );
    }
    const payout = d.payout ?? {};
    if (payout.method !== "pix" && payout.method !== "conta") {
      add("ob-payout", "Forma de recebimento", "Escolha como a T1 vai pagar a loja.");
    } else if (payout.method === "pix") {
      if (blank(payout.pixKey)) add("ob-pix", "Chave Pix");
    } else {
      if (blank(payout.bank)) add("ob-bank", "Banco");
      if (blank(payout.agency)) add("ob-ag", "Agência");
      if (blank(payout.account)) add("ob-acc", "Conta");
    }
  }

  for (const req of requiredDocs(d.kind)) {
    if (req.min === 0) continue;
    const count = documents.filter(
      (x) => x.kind === req.kind && x.status !== "recusado",
    ).length;
    if (count < req.min) {
      add(
        `ob-doc-${req.kind}`,
        req.label,
        req.min > 1 ? `Envie ${req.min} ou mais arquivos.` : "Envie este documento.",
      );
    }
  }

  if (d.termsAccepted !== true) {
    add("ob-terms", "Aceite dos termos", "Marque que leu e aceita os termos.");
  }
  return out;
}
