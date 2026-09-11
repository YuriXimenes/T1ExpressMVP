import { cn } from "@/lib/utils";
import { Container } from "@/components/shared/container";

const backgrounds = {
  white: "bg-background",
  muted: "bg-slate-50",
  brand: "bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 text-white",
} as const;

export function Section({
  id,
  background = "white",
  className,
  containerClassName,
  children,
}: {
  id?: string;
  background?: keyof typeof backgrounds;
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("py-12 md:py-16", backgrounds[background], className)}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}
