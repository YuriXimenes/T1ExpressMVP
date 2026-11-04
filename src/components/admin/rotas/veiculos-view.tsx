"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/components/shared/price";
import { useCan } from "@/lib/admin/access-provider";
import { AdminError } from "@/lib/admin/api";
import { dayKey } from "@/lib/admin/dashboard";
import {
  fetchFuelPrices,
  fetchOpsSettings,
  fetchVehicles,
  setFuelPrice,
  updateOpsSettings,
  upsertVehicle,
  type FuelPrice,
  type OpsSettings,
  type Vehicle,
} from "@/lib/routes/api";

const errorText = (err: unknown, fallback: string) =>
  err instanceof AdminError ? err.message : fallback;
const toNumber = (v: string) => Number(v.replace(",", "."));

export function VeiculosView() {
  const canEdit = useCan("coletas", "edit");
  const canCreate = useCan("coletas", "create");
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [prices, setPrices] = useState<FuelPrice[]>([]);
  const [settings, setSettings] = useState<OpsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const [vForm, setVForm] = useState({
    name: "",
    plate: "",
    kmPerLiter: "",
    active: true,
  });
  const [priceDay, setPriceDay] = useState(dayKey(new Date()));
  const [price, setPrice] = useState("");
  const [base, setBase] = useState({
    name: "",
    lat: "",
    lng: "",
    factor: "",
    speed: "",
    stop: "",
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [v, p, s] = await Promise.all([
        fetchVehicles(),
        fetchFuelPrices(),
        fetchOpsSettings(),
      ]);
      setVehicles(v);
      setPrices(p);
      setSettings(s);
      setBase({
        name: s.baseName,
        lat: s.baseLat?.toString() ?? "",
        lng: s.baseLng?.toString() ?? "",
        factor: s.roadFactor.toString(),
        speed: s.avgSpeedKmh.toString(),
        stop: s.stopMinutes.toString(),
      });
    } catch (err) {
      setError(errorText(err, "Não foi possível carregar."));
    }
  }

  useEffect(() => {
    // queueMicrotask: nenhuma chamada de setState fica no corpo síncrono do efeito.
    queueMicrotask(() => void load());
  }, []);

  async function run(action: () => Promise<unknown>, done: string, fallback: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage(done);
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openVehicle(v: Vehicle | "new") {
    setVForm(
      v === "new"
        ? { name: "", plate: "", kmPerLiter: "", active: true }
        : {
            name: v.name,
            plate: v.plate ?? "",
            kmPerLiter: v.kmPerLiter.toString(),
            active: v.active,
          },
    );
    setEditing(v);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Veículos e combustível</h1>
        <p className="text-sm text-slate-500">
          Consumo dos veículos, preço do litro por dia e a base de onde as viagens saem.
          Cada viagem guarda o preço e o consumo do dia em que foi montada.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {!vehicles && !error && <p className="text-sm text-slate-500">Carregando...</p>}

      {vehicles && settings && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Card className="gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Veículos</h2>
              {canCreate && (
                <Button type="button" size="sm" onClick={() => openVehicle("new")}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Veículo
                </Button>
              )}
            </div>
            {vehicles.length === 0 && (
              <p className="text-sm text-slate-500">Nenhum veículo cadastrado.</p>
            )}
            <ul className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-slate-900">{v.name}</span>
                    {v.plate && <span className="text-slate-500"> · {v.plate}</span>}
                    <span className="text-slate-500"> · {v.kmPerLiter} km/l</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!v.active && <Badge variant="destructive">Inativo</Badge>}
                    {canEdit && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openVehicle(v)}
                      >
                        Editar
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="gap-3 p-5">
            <h2 className="text-base font-semibold text-slate-900">Preço do litro</h2>
            {canEdit && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="fuel-day" className="text-xs text-slate-500">
                    Dia
                  </Label>
                  <Input
                    id="fuel-day"
                    type="date"
                    value={priceDay}
                    onChange={(e) => setPriceDay(e.target.value)}
                    className="h-8 w-40 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="fuel-price" className="text-xs text-slate-500">
                    R$ por litro
                  </Label>
                  <Input
                    id="fuel-price"
                    inputMode="decimal"
                    placeholder="6,29"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="h-8 w-28 text-sm"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !price}
                  onClick={() =>
                    void run(
                      () => setFuelPrice(priceDay, toNumber(price)),
                      "Preço do litro salvo.",
                      "Não foi possível salvar o preço.",
                    ).then((ok) => ok && setPrice(""))
                  }
                >
                  Salvar
                </Button>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Vale o último preço cadastrado até o dia da viagem.
            </p>
            <ul className="flex flex-col divide-y divide-slate-100 text-sm">
              {prices.slice(0, 10).map((p) => (
                <li key={p.day} className="flex justify-between py-1.5">
                  <span className="text-slate-600">
                    {new Date(`${p.day}T12:00:00`).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatBRL(p.pricePerLiter)}
                  </span>
                </li>
              ))}
              {prices.length === 0 && (
                <li className="py-1.5 text-slate-500">Nenhum preço cadastrado.</li>
              )}
            </ul>
          </Card>

          <Card className="gap-3 p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-900">Base e estimativas</h2>
            <p className="text-xs text-slate-500">
              As viagens saem e voltam para a base. A distância prevista é a linha reta
              entre as lojas × fator de ruas; os horários usam a velocidade média e o
              tempo por parada. Para pegar as coordenadas, clique com o botão direito no
              Google Maps.
            </p>
            <fieldset disabled={!canEdit || busy} className="grid gap-3 sm:grid-cols-3">
              <Field
                id="base-name"
                label="Nome da base"
                value={base.name}
                onChange={(v) => setBase({ ...base, name: v })}
              />
              <Field
                id="base-lat"
                label="Latitude"
                value={base.lat}
                placeholder="-22,9068"
                onChange={(v) => setBase({ ...base, lat: v })}
              />
              <Field
                id="base-lng"
                label="Longitude"
                value={base.lng}
                placeholder="-43,1729"
                onChange={(v) => setBase({ ...base, lng: v })}
              />
              <Field
                id="base-factor"
                label="Fator de ruas"
                value={base.factor}
                onChange={(v) => setBase({ ...base, factor: v })}
              />
              <Field
                id="base-speed"
                label="Velocidade média (km/h)"
                value={base.speed}
                onChange={(v) => setBase({ ...base, speed: v })}
              />
              <Field
                id="base-stop"
                label="Minutos por parada"
                value={base.stop}
                onChange={(v) => setBase({ ...base, stop: v })}
              />
            </fieldset>
            {canEdit && (
              <Button
                type="button"
                className="self-start"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      updateOpsSettings({
                        baseName: base.name,
                        baseLat: base.lat ? toNumber(base.lat) : undefined,
                        baseLng: base.lng ? toNumber(base.lng) : undefined,
                        roadFactor: toNumber(base.factor),
                        avgSpeedKmh: toNumber(base.speed),
                        stopMinutes: Math.round(toNumber(base.stop)),
                      }),
                    "Base salva. Vale para as próximas viagens montadas.",
                    "Não foi possível salvar a base.",
                  )
                }
              >
                Salvar base
              </Button>
            )}
          </Card>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !busy && !v && setEditing(null)}>
        {editing && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing === "new" ? "Novo veículo" : `Editar ${editing.name}`}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <Field
                id="v-name"
                label="Nome"
                value={vForm.name}
                placeholder="Ex.: Moto do João"
                onChange={(v) => setVForm({ ...vForm, name: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="v-plate"
                  label="Placa"
                  value={vForm.plate}
                  onChange={(v) => setVForm({ ...vForm, plate: v })}
                />
                <Field
                  id="v-kpl"
                  label="Consumo (km/l)"
                  value={vForm.kmPerLiter}
                  onChange={(v) => setVForm({ ...vForm, kmPerLiter: v })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand-600 h-4 w-4"
                  checked={vForm.active}
                  onChange={(e) => setVForm({ ...vForm, active: e.target.checked })}
                />
                Ativo (aparece ao montar viagens)
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      upsertVehicle(editing === "new" ? null : editing.id, {
                        name: vForm.name,
                        plate: vForm.plate || undefined,
                        kmPerLiter: toNumber(vForm.kmPerLiter),
                        active: vForm.active,
                      }),
                    "Veículo salvo.",
                    "Não foi possível salvar o veículo.",
                  ).then((ok) => ok && setEditing(null))
                }
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
