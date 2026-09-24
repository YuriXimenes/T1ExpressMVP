"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AdminError, fetchCorreiosRate, updateCorreiosRate } from "@/lib/admin/api";

export function CorreiosTab() {
  const [rate, setRate] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCorreiosRate()
      .then((r) => {
        setRate(r);
        setValue(r.toFixed(2));
      })
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }, []);

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const n = Number(value.replace(",", "."));
      await updateCorreiosRate(n);
      setRate(n);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  if (rate === null && !error)
    return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <Card className="max-w-sm gap-3 p-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        Tarifa fixa dos Correios
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="correios-rate">Valor (R$)</Label>
        <Input
          id="correios-rate"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSuccess(false);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-emerald-600">Salvo.</p>}
      <Button onClick={() => void save()} disabled={isSaving} className="w-fit">
        {isSaving ? "Salvando..." : "Salvar"}
      </Button>
    </Card>
  );
}
