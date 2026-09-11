import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function StubPageHero({
  title,
  description,
  inProgress = false,
}: {
  title: string;
  description: ReactNode;
  inProgress?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {inProgress && (
        <Badge variant="secondary" className="mb-4">
          Em construção
        </Badge>
      )}
      <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{title}</h1>
      <p className="mt-4 text-lg text-slate-600">{description}</p>
    </div>
  );
}
