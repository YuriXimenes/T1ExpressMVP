import { cn } from "@/lib/utils";

/** Largura máxima do layout novo (1320px) com margens de 16/24/32px. */
export function V2Container({
  className,
  children,
  size = "lg",
}: {
  className?: string;
  children: React.ReactNode;
  size?: "lg" | "md" | "sm";
}) {
  const max = size === "sm" ? "max-w-[480px]" : size === "md" ? "max-w-[760px]" : "max-w-[1320px]";
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", max, className)}>{children}</div>;
}
