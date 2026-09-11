import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FeatureCard({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Card className={cn("group p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-3 transition-transform duration-300 group-hover:scale-105">
        <span
          className="bg-brand-50 flex h-10 w-10 items-center justify-center rounded-lg"
          aria-hidden="true"
        >
          <Icon className="text-brand-600 h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
    </Card>
  );
}
