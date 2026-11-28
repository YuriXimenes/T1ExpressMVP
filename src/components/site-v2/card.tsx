import { cn } from "@/lib/utils";

const tones = {
  plain: "bg-t1-card shadow-[inset_0_0_0_1px_var(--t1-line),var(--t1-shadow-sm)]",
  raised: "bg-white shadow-[inset_0_0_0_1px_var(--t1-line),var(--t1-shadow)]",
  line: "bg-t1-card shadow-[inset_0_0_0_2px_var(--t1-accent-line),var(--t1-shadow-sm)]",
  sunken: "rounded-t1-sm bg-t1-sunken shadow-[inset_0_0_0_1px_var(--t1-line)]",
  blue: "bg-[linear-gradient(135deg,#1e40af,#1d4ed8_55%,#2563eb)] text-white shadow-[0_20px_50px_-24px_rgba(37,99,235,.7)]",
} as const;

/** Cartão do layout novo. */
export function V2Card({
  className,
  tone = "plain",
  as: Tag = "div",
  children,
}: {
  className?: string;
  tone?: keyof typeof tones;
  as?: "div" | "section" | "article" | "li";
  children: React.ReactNode;
}) {
  return <Tag className={cn("rounded-t1 p-5", tones[tone], className)}>{children}</Tag>;
}

export function V2CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn("font-t1-display text-[clamp(22px,2.4vw,28px)] leading-[1.06] uppercase", className)}>
      {children}
    </h3>
  );
}
