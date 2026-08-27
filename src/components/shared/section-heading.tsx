import { cn } from "@/lib/utils";

export function SectionHeading({
  kicker,
  title,
  description,
  align = "center",
  invert = false,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  invert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-2xl",
        align === "center" ? "text-center" : "ml-0 text-left",
        className,
      )}
    >
      {kicker && (
        <p
          className={cn(
            "text-sm font-semibold tracking-wide uppercase",
            invert ? "text-brand-200" : "text-brand-600",
          )}
        >
          {kicker}
        </p>
      )}
      <h2
        className={cn(
          "mt-2 text-3xl font-bold sm:text-4xl",
          invert ? "text-white" : "text-slate-900",
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "mt-4 text-base sm:text-lg",
            invert ? "text-brand-100" : "text-slate-600",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}
