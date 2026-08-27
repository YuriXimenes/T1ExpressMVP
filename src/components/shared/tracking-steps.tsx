import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrackingStepStatus = "done" | "current" | "pending";

export interface TrackingStep {
  label: string;
  status: TrackingStepStatus;
}

export function TrackingSteps({ steps }: { steps: TrackingStep[] }) {
  return (
    <ol className="flex flex-col gap-0 md:flex-row md:items-start">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.label} className="flex flex-1 flex-row md:flex-col">
            <div className="flex flex-col items-center md:w-full md:flex-row">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                  step.status === "done" && "text-brand-700 border-white bg-white",
                  step.status === "current" && "bg-brand-600 border-white text-white",
                  step.status === "pending" &&
                    "border-white/40 bg-transparent text-white/60",
                )}
                aria-current={step.status === "current" ? "step" : undefined}
              >
                {step.status === "done" ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              {!isLast && (
                <span
                  className={cn(
                    "mx-0 my-1 h-8 w-0.5 md:mx-2 md:my-0 md:h-0.5 md:w-full md:flex-1",
                    step.status === "done" ? "bg-white" : "bg-white/30",
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="mt-0 ml-4 pb-6 md:mt-3 md:ml-0 md:pb-0">
              <p className="text-sm font-medium text-white">{step.label}</p>
              <span className="sr-only">
                {step.status === "done"
                  ? "Concluído"
                  : step.status === "current"
                    ? "Etapa atual"
                    : "Pendente"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
