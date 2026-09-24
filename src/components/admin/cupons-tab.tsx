"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AdminError,
  fetchCoupons,
  upsertCoupon,
  type AdminCoupon,
} from "@/lib/admin/api";

function formatValue(coupon: AdminCoupon) {
  return coupon.type === "percent" ? `${coupon.value}%` : `R$ ${coupon.value.toFixed(2)}`;
}

function emptyForm() {
  return { type: "percent" as "percent" | "flat", value: 10, label: "", active: true };
}

export function CuponsTab() {
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [isNew, setIsNew] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  function load() {
    fetchCoupons()
      .then(setCoupons)
      .catch((err) =>
        setError(err instanceof AdminError ? err.message : "Não foi possível carregar."),
      );
  }
  useEffect(load, []);

  function openCreate() {
    setIsNew(true);
    setCode("");
    setForm(emptyForm());
    setFormError(null);
    setOpen(true);
  }
  function openEdit(coupon: AdminCoupon) {
    setIsNew(false);
    setCode(coupon.code);
    setForm({
      type: coupon.type,
      value: coupon.value,
      label: coupon.label,
      active: coupon.active,
    });
    setFormError(null);
    setOpen(true);
  }

  async function save() {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await upsertCoupon(code, form);
      setOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(coupon: AdminCoupon) {
    try {
      await upsertCoupon(coupon.code, {
        type: coupon.type,
        value: coupon.value,
        label: coupon.label,
        active: !coupon.active,
      });
      load();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Não foi possível salvar.");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!coupons) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              Novo cupom
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isNew ? "Novo cupom" : "Editar cupom"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-code">Código</Label>
                <Input
                  id="coupon-code"
                  value={code}
                  disabled={!isNew}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-type">Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm({ ...form, type: v as "percent" | "flat" })
                    }
                  >
                    <SelectTrigger id="coupon-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentual</SelectItem>
                      <SelectItem value="flat">Valor fixo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coupon-value">
                    Valor {form.type === "percent" ? "(%)" : "(R$)"}
                  </Label>
                  <Input
                    id="coupon-value"
                    type="number"
                    step="0.01"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-label">Rótulo (mostrado ao cliente)</Label>
                <Input
                  id="coupon-label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="coupon-active"
                  checked={form.active}
                  onCheckedChange={(c) => setForm({ ...form, active: c === true })}
                />
                <Label htmlFor="coupon-active" className="font-normal">
                  Ativo
                </Label>
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600">
                  {formError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => void save()} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Rótulo</th>
              <th className="px-4 py-2 font-medium">Valor</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.code} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-900">{coupon.code}</td>
                <td className="px-4 py-2.5 text-slate-700">{coupon.label}</td>
                <td className="px-4 py-2.5 text-slate-700">{formatValue(coupon)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={coupon.active ? "secondary" : "outline"}>
                    {coupon.active ? "Ativo" : "Inativo"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(coupon)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void toggleActive(coupon)}
                  >
                    {coupon.active ? "Desativar" : "Ativar"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
