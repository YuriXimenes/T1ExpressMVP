/**
 * CSV que o Excel em português abre direto: separador ";" (a vírgula é o
 * separador decimal no Brasil), BOM UTF-8 (senão os acentos quebram) e CRLF.
 */
const SEPARATOR = ";";

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(SEPARATOR));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Baixa o CSV no navegador. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
