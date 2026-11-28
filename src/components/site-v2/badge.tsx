import { cn } from "@/lib/utils";

const tones = {
  brand: "bg-t1-brand-50 text-t1-brand-800 shadow-[inset_0_0_0_1px_var(--t1-info-line)]",
  neutral: "bg-t1-sunken text-t1-muted shadow-[inset_0_0_0_1px_var(--t1-line)]",
  ok: "bg-t1-ok-bg text-t1-ok-ink shadow-[inset_0_0_0_1px_var(--t1-ok-line)]",
  warn: "bg-t1-warn-bg text-t1-warn-ink shadow-[inset_0_0_0_1px_var(--t1-warn-line)]",
  danger: "bg-t1-danger-bg text-t1-danger-ink shadow-[inset_0_0_0_1px_var(--t1-danger-line)]",
  violet: "bg-t1-violet-bg text-t1-violet-ink shadow-[inset_0_0_0_1px_var(--t1-violet-line)]",
} as const;

export type BadgeTone = keyof typeof tones;

/** Selo pequeno em caixa alta (ex.: "Novo", "Grátis"). */
export function V2Badge({
  tone = "brand",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[10.5px] font-bold tracking-[0.1em] whitespace-nowrap uppercase [&_svg]:size-3",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Situação com bolinha (ex.: etapa do pedido). */
export function V2Status({
  tone = "brand",
  pulse = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-2 rounded-full px-3 py-[3px] text-xs font-bold tracking-[0.02em] whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <i
        aria-hidden="true"
        className={cn("size-[7px] shrink-0 rounded-full bg-current", pulse && "motion-safe:animate-pulse")}
      />
      {children}
    </span>
  );
}
