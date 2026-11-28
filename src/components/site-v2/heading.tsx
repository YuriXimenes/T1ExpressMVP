import { cn } from "@/lib/utils";

/** Rótulo pequeno acima do título (Anton espaçado, azul). */
export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn("inline-block font-t1-display text-[13px] tracking-[0.22em] text-t1-accent uppercase", className)}
    >
      {children}
    </span>
  );
}

const sizes = {
  xl: "text-[clamp(44px,8vw,104px)] leading-[1.04]",
  lg: "text-[clamp(36px,5.6vw,76px)] leading-[1.06]",
  md: "text-[clamp(24px,2.6vw,30px)] leading-[1.08]",
  sm: "text-xl leading-[1.1] tracking-[0.04em]",
} as const;

/** Título display (Anton, caixa alta). */
export function DisplayHeading({
  as: Tag = "h2",
  size = "lg",
  className,
  id,
  children,
}: {
  as?: "h1" | "h2" | "h3" | "h4" | "p";
  size?: keyof typeof sizes;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag id={id} className={cn("font-t1-display font-normal tracking-[0.005em] uppercase", sizes[size], className)}>
      {children}
    </Tag>
  );
}
