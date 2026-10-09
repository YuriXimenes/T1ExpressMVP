"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { SignupAddress } from "@/lib/types/signup";
import { REGIONS, detectRegion } from "@/lib/survey/regions";
import { REGION_QUESTION } from "@/lib/survey/questions";
import { cn } from "@/lib/utils";

/**
 * Pergunta de região na tela de confirmação do pedido. Tenta descobrir pelo CEP
 * do cadastro; se acertar, a pessoa só segue (ou troca, se estiver errado). Se
 * não souber, a pessoa escolhe — e o botão da página fica bloqueado até lá.
 */
export function SurveyRegionStep({
  address,
  value,
  onChange,
  onDetected,
}: {
  address: SignupAddress | undefined;
  value: string | undefined;
  onChange: (region: string) => void;
  /** Guarda o que o CEP identificou (ou null) e o CEP usado, para o admin. */
  onDetected: (detected: string | null, zip: string | null) => void;
}) {
  const [detecting, setDetecting] = useState(true);
  const [detected, setDetected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Roda uma vez por abertura da tela; os callbacks vão por ref para o efeito
  // não reiniciar a consulta a cada digitação/renderização.
  const callbacks = useRef({ onChange, onDetected });
  useEffect(() => {
    callbacks.current = { onChange, onDetected };
  });
  const addressRef = useRef(address);

  useEffect(() => {
    let cancelled = false;
    void detectRegion(addressRef.current).then(({ region }) => {
      if (cancelled) return;
      setDetected(region);
      setDetecting(false);
      callbacks.current.onDetected(region, addressRef.current?.zip?.trim() || null);
      if (region) callbacks.current.onChange(region);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const addressLine = address
    ? [
        [address.street, address.number].filter(Boolean).join(", "),
        address.complement,
        address.neighborhood,
        [address.city, address.state].filter(Boolean).join("/"),
        address.zip && `CEP ${address.zip}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const showList = !detecting && (editing || !detected);

  return (
    <Card className="mt-6 gap-4 p-6">
      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
        <MapPin className="text-brand-600 h-4 w-4" aria-hidden="true" />
        {REGION_QUESTION.label}
      </p>

      <p className="text-sm text-slate-600">
        {addressLine ? (
          <>
            <span className="text-slate-500">Endereço cadastrado: </span>
            {addressLine}
          </>
        ) : (
          "Você ainda não tem um endereço cadastrado."
        )}
      </p>

      {detecting && (
        <p role="status" className="text-sm text-slate-500">
          Identificando sua região...
        </p>
      )}

      {!detecting && detected && !editing && (
        <div className="bg-brand-50 flex flex-col gap-2 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">
            Pelo seu CEP, identificamos que você está em{" "}
            <strong className="text-slate-900">{detected}</strong>.
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand-700 text-left text-sm font-semibold underline underline-offset-2 sm:text-right"
          >
            Não é essa? Alterar região
          </button>
        </div>
      )}

      {!detecting && !detected && (
        <p role="status" className="text-sm text-slate-600">
          {addressLine
            ? "Não conseguimos identificar sua região pelo CEP. Selecione onde você mora:"
            : "Selecione a região onde você mora:"}
        </p>
      )}

      {showList && (
        <fieldset>
          <legend className="sr-only">{REGION_QUESTION.label}</legend>
          <div className="flex flex-col gap-2">
            {REGIONS.map((region) => {
              const selected = value === region;
              return (
                <label
                  key={region}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                    selected
                      ? "border-brand-600 bg-brand-50 text-slate-900"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <input
                    type="radio"
                    name="region"
                    value={region}
                    checked={selected}
                    onChange={() => onChange(region)}
                    className="accent-brand-600 h-4 w-4 shrink-0"
                  />
                  {region}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </Card>
  );
}
