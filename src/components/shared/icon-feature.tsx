import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function IconFeature({
  icon: Icon,
  title,
  description,
  invert = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  invert?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl",
          invert ? "bg-white/15" : "bg-brand-50",
        )}
        aria-hidden="true"
      >
        <Icon className={cn("h-6 w-6", invert ? "text-white" : "text-brand-600")} />
      </span>
      <div>
        <p className={cn("font-semibold", invert ? "text-white" : "text-slate-900")}>
          {title}
        </p>
        {description && (
          <p className={cn("mt-1 text-sm", invert ? "text-brand-100" : "text-slate-600")}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
