import type { ComparisonCarrier, ComparisonRow } from "@/lib/types/market-comparison";

export const marketComparisonCarriers: ComparisonCarrier[] = [
  { id: "t1-express", name: "T1 Express", highlight: true },
  { id: "uber-flash", name: "Uber Flash / Envios" },
  { id: "loggi", name: "Loggi" },
  { id: "correios", name: "Correios" },
];

export const marketComparisonRows: ComparisonRow[] = [
  {
    label: "Prazo médio",
    values: [
      { text: "1 a 4 dias úteis" },
      { text: "Poucas horas (mesma cidade)" },
      { text: "1 a 3 dias úteis (capitais)" },
      { text: "2 a 8 dias úteis" },
    ],
  },
  {
    label: "Especializada em cards e colecionáveis",
    values: [
      { status: "positive", text: "1º do Brasil" },
      { status: "negative", text: "Não" },
      { status: "negative", text: "Não" },
      { status: "negative", text: "Não" },
    ],
  },
  {
    label: "Parceria com lojas TCG",
    values: [
      { status: "positive", text: "Sim" },
      { status: "negative", text: "Não" },
      { status: "negative", text: "Não" },
      { status: "negative", text: "Não" },
    ],
  },
  {
    label: "Centralização de pedidos de várias lojas",
    values: [
      { status: "positive", text: "Sim" },
      { status: "negative", text: "Não" },
      { status: "negative", text: "Não" },
      { status: "negative", text: "Não" },
    ],
  },
  {
    label: "Preço previsível",
    values: [
      { status: "positive", text: "Sim", detail: "R$ 12 + R$ 3 por loja adicional" },
      { status: "negative", text: "Não", detail: "Média de R$ 15 por loja" },
      { status: "negative", text: "Não", detail: "Média de R$ 15 por loja" },
      {
        status: "negative",
        text: "Não",
        detail: "Média de R$ 12 por loja (via carta registrada)",
      },
    ],
  },
  {
    label: "Rastreamento em tempo real",
    values: [
      { status: "positive", text: "Sim" },
      { status: "positive", text: "Sim" },
      { status: "positive", text: "Sim" },
      { status: "positive", text: "Sim" },
    ],
  },
];
