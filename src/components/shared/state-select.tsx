"use client";

import { Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalog } from "@/lib/catalog/provider";

/** Dropdown com todos os estados do Brasil (lista vinda do catálogo). */
export function StateSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (uf: string) => void;
}) {
  const { brazilStates } = useCatalog();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Selecione o estado" />
      </SelectTrigger>
      <SelectContent>
        {brazilStates.map((state) => (
          <SelectItem key={state.uf} value={state.uf}>
            {state.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Aviso exibido quando o estado escolhido ainda não é atendido (hoje só o RJ). */
export function StateAvailabilityNotice({ uf }: { uf: string }) {
  if (!uf || uf === "RJ") return null;

  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        A T1 Express ainda não está presente no seu estado, mas você pode seguir criando a
        conta para acompanhar as novidades.
      </p>
    </div>
  );
}
