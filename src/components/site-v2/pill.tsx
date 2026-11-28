import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Botão em pílula do layout novo (Anton, caixa alta). */
export const pillVariants = cva(
  "inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-full text-center font-t1-display uppercase tracking-[0.08em] transition-[background,box-shadow,transform,color] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        blue: "bg-t1-brand text-white shadow-[inset_0_0_0_1px_rgba(29,78,216,.6),var(--t1-glow)] hover:bg-t1-brand-700",
        ghost:
          "bg-white text-t1-ink shadow-[inset_0_0_0_1px_var(--t1-line-2),var(--t1-shadow-sm)] hover:bg-t1-card-3 hover:shadow-[inset_0_0_0_1px_var(--t1-line-3),var(--t1-shadow-sm)]",
        line: "bg-t1-brand-50 text-t1-brand-800 shadow-[inset_0_0_0_2px_var(--t1-brand)] hover:bg-t1-brand-tint",
        white: "bg-white text-t1-brand-800 shadow-[0_8px_24px_-10px_rgba(11,30,69,.45)] hover:bg-t1-brand-50",
        danger:
          "bg-t1-danger-bg text-t1-danger-ink shadow-[inset_0_0_0_1px_var(--t1-danger-line)] hover:bg-[#fee2e2]",
      },
      size: {
        md: "min-h-[52px] px-[26px] text-[15px]",
        sm: "min-h-11 px-[18px] text-[13px]",
      },
    },
    defaultVariants: { variant: "blue", size: "md" },
  },
);

type PillVariants = VariantProps<typeof pillVariants>;

export function PillLink({
  href,
  className,
  variant,
  size,
  children,
  ...rest
}: PillVariants & React.ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn(pillVariants({ variant, size }), className)} {...rest}>
      {children}
    </Link>
  );
}

export function PillButton({
  className,
  variant,
  size,
  type = "button",
  ...rest
}: PillVariants & React.ComponentProps<"button">) {
  return <button type={type} className={cn(pillVariants({ variant, size }), className)} {...rest} />;
}
