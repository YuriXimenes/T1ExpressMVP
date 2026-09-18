import { Check } from "lucide-react";
import { passwordRequirements } from "@/lib/password";
import { cn } from "@/lib/utils";

/** Checklist dos requisitos de senha, marcando os que já foram atendidos. */
export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="grid gap-1 text-xs">
      {passwordRequirements.map((requirement) => {
        const met = requirement.test(password);
        return (
          <li
            key={requirement.id}
            className={cn(
              "flex items-center gap-1.5",
              met ? "text-emerald-600" : "text-slate-400",
            )}
          >
            <Check
              className={cn("h-3.5 w-3.5", !met && "opacity-30")}
              aria-hidden="true"
            />
            {requirement.label}
          </li>
        );
      })}
    </ul>
  );
}
