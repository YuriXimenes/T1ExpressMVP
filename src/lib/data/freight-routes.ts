import type { FreightRouteQuote } from "@/lib/types/freight-route";

/**
 * Cotações reais coletadas manualmente nos apps/sites de Loggi e Uber para
 * cada rota loja de coleta -> loja de retirada, extraídas de
 * "Analise_Combinatoria_Fretes.xlsx". A coluna Uber já está completa para
 * as 40 rotas.
 */
export const freightRoutes: FreightRouteQuote[] = [
  // Destino: Cards of Paradise (fs-01)
  { originStoreId: "fs-02", destinationStoreId: "fs-01", loggiBRL: 14.9, uberBRL: 5.81 },
  {
    originStoreId: "fs-03",
    destinationStoreId: "fs-01",
    loggiBRL: 28.67,
    uberBRL: 21.07,
  },
  {
    originStoreId: "fs-04",
    destinationStoreId: "fs-01",
    loggiBRL: 28.78,
    uberBRL: 13.84,
  },
  {
    originStoreId: "fs-05",
    destinationStoreId: "fs-01",
    loggiBRL: 38.94,
    uberBRL: 28.26,
  },
  {
    originStoreId: "fs-06",
    destinationStoreId: "fs-01",
    loggiBRL: 38.46,
    uberBRL: 34.09,
  },
  {
    originStoreId: "fs-07",
    destinationStoreId: "fs-01",
    loggiBRL: 38.78,
    uberBRL: 34.95,
  },
  {
    originStoreId: "fs-08",
    destinationStoreId: "fs-01",
    loggiBRL: 48.88,
    uberBRL: 45.55,
  },
  {
    originStoreId: "fs-09",
    destinationStoreId: "fs-01",
    loggiBRL: 57.09,
    uberBRL: 52.19,
  },
  {
    originStoreId: "fs-10",
    destinationStoreId: "fs-01",
    loggiBRL: 57.09,
    uberBRL: 24.57,
  },
  {
    originStoreId: "fs-11",
    destinationStoreId: "fs-01",
    loggiBRL: 57.09,
    uberBRL: 42.65,
  },

  // Destino: Konklave (fs-11)
  {
    originStoreId: "fs-01",
    destinationStoreId: "fs-11",
    loggiBRL: 47.57,
    uberBRL: 41.09,
  },
  {
    originStoreId: "fs-02",
    destinationStoreId: "fs-11",
    loggiBRL: 51.49,
    uberBRL: 41.09,
  },
  {
    originStoreId: "fs-03",
    destinationStoreId: "fs-11",
    loggiBRL: 61.92,
    uberBRL: 55.01,
  },
  {
    originStoreId: "fs-04",
    destinationStoreId: "fs-11",
    loggiBRL: 58.44,
    uberBRL: 32.08,
  },
  {
    originStoreId: "fs-05",
    destinationStoreId: "fs-11",
    loggiBRL: 82.86,
    uberBRL: 79.01,
  },
  {
    originStoreId: "fs-06",
    destinationStoreId: "fs-11",
    loggiBRL: 77.23,
    uberBRL: 86.37,
  },
  {
    originStoreId: "fs-07",
    destinationStoreId: "fs-11",
    loggiBRL: 77.54,
    uberBRL: 86.37,
  },
  {
    originStoreId: "fs-08",
    destinationStoreId: "fs-11",
    loggiBRL: 84.01,
    uberBRL: 80.53,
  },
  {
    originStoreId: "fs-09",
    destinationStoreId: "fs-11",
    loggiBRL: 81.08,
    uberBRL: 86.46,
  },
  { originStoreId: "fs-10", destinationStoreId: "fs-11", loggiBRL: 82, uberBRL: 43.42 },

  // Destino: Magic Store Brasil (fs-05)
  {
    originStoreId: "fs-01",
    destinationStoreId: "fs-05",
    loggiBRL: 42.48,
    uberBRL: 33.69,
  },
  {
    originStoreId: "fs-02",
    destinationStoreId: "fs-05",
    loggiBRL: 43.58,
    uberBRL: 33.69,
  },
  {
    originStoreId: "fs-03",
    destinationStoreId: "fs-05",
    loggiBRL: 26.71,
    uberBRL: 18.22,
  },
  {
    originStoreId: "fs-04",
    destinationStoreId: "fs-05",
    loggiBRL: 31.35,
    uberBRL: 15.78,
  },
  { originStoreId: "fs-06", destinationStoreId: "fs-05", loggiBRL: 14.9, uberBRL: 6.95 },
  { originStoreId: "fs-07", destinationStoreId: "fs-05", loggiBRL: 14.9, uberBRL: 6.95 },
  { originStoreId: "fs-08", destinationStoreId: "fs-05", loggiBRL: 21.8, uberBRL: 17.91 },
  {
    originStoreId: "fs-09",
    destinationStoreId: "fs-05",
    loggiBRL: 55.57,
    uberBRL: 48.69,
  },
  { originStoreId: "fs-10", destinationStoreId: "fs-05", loggiBRL: 61.1, uberBRL: 23.12 },
  { originStoreId: "fs-11", destinationStoreId: "fs-05", loggiBRL: 78.4, uberBRL: 72.4 },

  // Destino: Collect & Play (fs-09)
  {
    originStoreId: "fs-01",
    destinationStoreId: "fs-09",
    loggiBRL: 55.76,
    uberBRL: 54.78,
  },
  {
    originStoreId: "fs-02",
    destinationStoreId: "fs-09",
    loggiBRL: 56.87,
    uberBRL: 54.78,
  },
  { originStoreId: "fs-03", destinationStoreId: "fs-09", loggiBRL: 55.55, uberBRL: 48.7 },
  {
    originStoreId: "fs-04",
    destinationStoreId: "fs-09",
    loggiBRL: 40.84,
    uberBRL: 25.14,
  },
  {
    originStoreId: "fs-05",
    destinationStoreId: "fs-09",
    loggiBRL: 60.92,
    uberBRL: 48.38,
  },
  {
    originStoreId: "fs-06",
    destinationStoreId: "fs-09",
    loggiBRL: 54.72,
    uberBRL: 53.32,
  },
  {
    originStoreId: "fs-07",
    destinationStoreId: "fs-09",
    loggiBRL: 55.28,
    uberBRL: 53.32,
  },
  {
    originStoreId: "fs-08",
    destinationStoreId: "fs-09",
    loggiBRL: 66.55,
    uberBRL: 68.96,
  },
  { originStoreId: "fs-10", destinationStoreId: "fs-09", loggiBRL: 14.9, uberBRL: 6.95 },
  {
    originStoreId: "fs-11",
    destinationStoreId: "fs-09",
    loggiBRL: 81.59,
    uberBRL: 84.44,
  },
];

/** Correios (Carta Registrada) cobra o mesmo valor fixo em todas as rotas da planilha. */
export const CORREIOS_FLAT_RATE_BRL = 13.25;
