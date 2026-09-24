"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { gameOptions } from "@/lib/data/games";
import {
  AdminError,
  fetchLeads,
  setLeadContacted,
  fetchSuggestions,
  setSuggestionContacted,
  type AdminLead,
  type AdminSuggestion,
} from "@/lib/admin/api";
import { cn } from "@/lib/utils";

function gameLabel(id: string) {
  return gameOptions.find((g) => g.id === id)?.label ?? id;
}

function LeadsTab() {
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetchLeads()
      .then(setLeads)
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(load, []);

  async function toggle(lead: AdminLead) {
    setBusyId(lead.id);
    try {
      await setLeadContacted(lead.id, !lead.contacted);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível concluir.");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!leads) return <p className="text-sm text-slate-500">Carregando...</p>;
  const visible = onlyPending ? leads.filter((l) => !l.contacted) : leads;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOnlyPending((v) => !v)}
        className={cn(
          "mb-4 rounded-full border px-3 py-1 text-xs font-medium",
          onlyPending
            ? "border-brand-600 bg-brand-50 text-brand-700"
            : "border-slate-200 text-slate-600",
        )}
      >
        {onlyPending ? "Mostrando só pendentes" : "Mostrando todos"}
      </button>
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">Nada por aqui.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((lead) => (
            <div key={lead.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{lead.storeName}</p>
                  <p className="text-sm text-slate-500">
                    {lead.city}/{lead.state} ·{" "}
                    {[lead.wantsPickup && "coleta", lead.wantsDropoff && "retirada"]
                      .filter(Boolean)
                      .join(" e ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={lead.contacted ? "outline" : "default"}
                  disabled={busyId === lead.id}
                  onClick={() => void toggle(lead)}
                >
                  {lead.contacted ? "Contatado ✓" : "Marcar como contatado"}
                </Button>
              </div>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                <p>{lead.contactName}</p>
                <p>{lead.contactPhone}</p>
                <p>{lead.contactEmail}</p>
                {lead.website && <p>{lead.website}</p>}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {lead.street}, {lead.number}
                {lead.complement ? ` — ${lead.complement}` : ""}
                {" · "}
                {lead.games.map(gameLabel).join(", ")}
                {lead.otherGames.length > 0 ? `, ${lead.otherGames.join(", ")}` : ""}
              </p>
              {lead.message && (
                <p className="mt-2 text-sm text-slate-700">
                  &ldquo;{lead.message}&rdquo;
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {new Date(lead.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionsTab() {
  const [suggestions, setSuggestions] = useState<AdminSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetchSuggestions()
      .then(setSuggestions)
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(load, []);

  async function toggle(s: AdminSuggestion) {
    setBusyId(s.id);
    try {
      await setSuggestionContacted(s.id, !s.contacted);
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível concluir.");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!suggestions) return <p className="text-sm text-slate-500">Carregando...</p>;
  const visible = onlyPending ? suggestions.filter((s) => !s.contacted) : suggestions;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOnlyPending((v) => !v)}
        className={cn(
          "mb-4 rounded-full border px-3 py-1 text-xs font-medium",
          onlyPending
            ? "border-brand-600 bg-brand-50 text-brand-700"
            : "border-slate-200 text-slate-600",
        )}
      >
        {onlyPending ? "Mostrando só pendentes" : "Mostrando todos"}
      </button>
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">Nada por aqui.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{s.storeName}</p>
                  <p className="text-sm text-slate-500">{s.storeAddress}</p>
                </div>
                <Button
                  size="sm"
                  variant={s.contacted ? "outline" : "default"}
                  disabled={busyId === s.id}
                  onClick={() => void toggle(s)}
                >
                  {s.contacted ? "Contatado ✓" : "Marcar como contatado"}
                </Button>
              </div>
              {s.comment && <p className="mt-2 text-sm text-slate-700">“{s.comment}”</p>}
              <p className="mt-2 text-xs text-slate-400">
                {new Date(s.createdAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FormulariosAdminView() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Formulários</h1>
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Quero ser um Ponto T1</TabsTrigger>
          <TabsTrigger value="sugestoes">Sugerir loja</TabsTrigger>
        </TabsList>
        <TabsContent value="leads" className="pt-4">
          <LeadsTab />
        </TabsContent>
        <TabsContent value="sugestoes" className="pt-4">
          <SuggestionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
