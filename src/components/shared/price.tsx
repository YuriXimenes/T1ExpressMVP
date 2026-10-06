import { cn } from "@/lib/utils";

export function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

/**
 * Valor em reais; quando é zero, mostra também o selo "Grátis" (fase de
 * testes de percepção de valor, com os preços zerados no admin).
 */
export function Price({
  value,
  className,
  prefix = "",
}: {
  value: number;
  className?: string;
  /** Ex.: "+" para linhas de acréscimo. Omitido quando o valor é zero. */
  prefix?: string;
}) {
  const isFree = Math.abs(value) < 0.005;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      {!isFree && prefix}
      {formatBRL(isFree ? 0 : value)}
      {isFree && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] leading-none font-semibold text-emerald-700">
          Grátis
        </span>
      )}
    </span>
  );
}
