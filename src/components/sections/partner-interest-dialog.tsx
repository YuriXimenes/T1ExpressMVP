"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GamesPicker } from "@/components/shared/games-picker";
import { InfoTooltip } from "@/components/shared/info-tooltip";
import { brazilStates } from "@/lib/data/brazil-states";
import { formatPhone } from "@/lib/format-phone";
import type { GameTag } from "@/lib/types/signup";

interface FormState {
  storeName: string;
  street: string;
  number: string;
  complement: string;
  city: string;
  state: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  website: string;
  message: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyForm(): FormState {
  return {
    storeName: "",
    street: "",
    number: "",
    complement: "",
    city: "",
    state: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    website: "",
    message: "",
  };
}

export function PartnerInterestDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [games, setGames] = useState<GameTag[]>([]);
  const [customGames, setCustomGames] = useState<string[]>([]);
  const [interestPickup, setInterestPickup] = useState(false);
  const [interestDropoff, setInterestDropoff] = useState(false);

  function updateField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const trimmedEmail = form.contactEmail.trim();
  const emailFormatIsValid =
    trimmedEmail.length === 0 || EMAIL_PATTERN.test(trimmedEmail);

  const isValid = Boolean(
    form.storeName.trim() &&
    (interestPickup || interestDropoff) &&
    form.street.trim() &&
    form.number.trim() &&
    form.city.trim() &&
    form.state.trim() &&
    form.contactName.trim() &&
    form.contactPhone.trim() &&
    trimmedEmail &&
    EMAIL_PATTERN.test(trimmedEmail) &&
    games.length > 0,
  );

  function handleSubmit() {
    if (!isValid) return;
    // TODO: substituir por envio real (com backend) quando essa integração existir.
    setSubmitted(true);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTimeout(() => {
        setSubmitted(false);
        setForm(emptyForm());
        setGames([]);
        setCustomGames([]);
        setInterestPickup(false);
        setInterestDropoff(false);
      }, 200);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        {submitted ? (
          <div className="py-4 text-center">
            <span className="bg-brand-50 mx-auto flex h-12 w-12 items-center justify-center rounded-full">
              <Check className="text-brand-600 h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              Interesse enviado!
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Obrigado pelo interesse em fazer parte da comunidade T1 Express. Vamos
              analisar os dados da {form.storeName || "sua loja"} e entrar em contato em
              breve pelo e-mail ou telefone informados.
            </p>
            <Button className="mt-6" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Quero ser um Ponto T1</DialogTitle>
              <DialogDescription>
                Preencha os dados da loja e do responsável — nosso time entra em contato
                para os próximos passos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="partner-store-name">Nome da loja</Label>
                <Input
                  id="partner-store-name"
                  value={form.storeName}
                  onChange={(event) => updateField("storeName", event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Interesse
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="partner-interest-pickup"
                      checked={interestPickup}
                      onCheckedChange={(checked) => setInterestPickup(checked === true)}
                    />
                    <Label
                      htmlFor="partner-interest-pickup"
                      className="flex items-center gap-1.5 font-normal"
                    >
                      Ponto de coleta
                      <InfoTooltip label="O que é Ponto de coleta?">
                        A T1 Express coleta na sua loja os pedidos feitos pelos clientes.
                      </InfoTooltip>
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="partner-interest-dropoff"
                      checked={interestDropoff}
                      onCheckedChange={(checked) => setInterestDropoff(checked === true)}
                    />
                    <Label
                      htmlFor="partner-interest-dropoff"
                      className="flex items-center gap-1.5 font-normal"
                    >
                      Ponto de retirada
                      <InfoTooltip label="O que é Ponto de retirada?">
                        Os clientes retiram na sua loja os pedidos transportados pela T1
                        Express.
                      </InfoTooltip>
                    </Label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Endereço da loja
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="partner-street">Rua</Label>
                    <Input
                      id="partner-street"
                      autoComplete="street-address"
                      value={form.street}
                      onChange={(event) => updateField("street", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="partner-number">Número</Label>
                    <Input
                      id="partner-number"
                      value={form.number}
                      onChange={(event) => updateField("number", event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="partner-complement">
                    Complemento <span className="text-slate-400">(opcional)</span>
                  </Label>
                  <Input
                    id="partner-complement"
                    value={form.complement}
                    onChange={(event) => updateField("complement", event.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="partner-city">Cidade</Label>
                    <Input
                      id="partner-city"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={(event) => updateField("city", event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="partner-state">Estado</Label>
                    <Select
                      value={form.state}
                      onValueChange={(value) => updateField("state", value)}
                    >
                      <SelectTrigger id="partner-state" className="w-full">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent>
                        {brazilStates.map((state) => (
                          <SelectItem key={state.uf} value={state.uf}>
                            {state.uf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  Responsável
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="partner-contact-name">Nome do responsável</Label>
                  <Input
                    id="partner-contact-name"
                    autoComplete="name"
                    value={form.contactName}
                    onChange={(event) => updateField("contactName", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="partner-contact-phone">
                      Telefone <span className="text-slate-400">(WhatsApp)</span>
                    </Label>
                    <Input
                      id="partner-contact-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="(21)91234-5678"
                      maxLength={14}
                      value={form.contactPhone}
                      onChange={(event) =>
                        updateField("contactPhone", formatPhone(event.target.value))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="partner-contact-email">E-mail</Label>
                    <Input
                      id="partner-contact-email"
                      type="email"
                      autoComplete="email"
                      value={form.contactEmail}
                      onChange={(event) =>
                        updateField("contactEmail", event.target.value)
                      }
                      aria-invalid={!emailFormatIsValid}
                      required
                    />
                    {!emailFormatIsValid && (
                      <p className="text-xs text-red-600">Informe um e-mail válido.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="partner-website">
                  Website <span className="text-slate-400">(opcional)</span>
                </Label>
                <Input
                  id="partner-website"
                  type="url"
                  placeholder="https://..."
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                />
              </div>

              <GamesPicker
                heading="Quais jogos a loja trabalha?"
                games={games}
                setGames={setGames}
                customGames={customGames}
                setCustomGames={setCustomGames}
              />

              <div className="space-y-1.5">
                <Label htmlFor="partner-message">
                  Mensagem <span className="text-slate-400">(opcional)</span>
                </Label>
                <Textarea
                  id="partner-message"
                  rows={3}
                  placeholder="Conte um pouco sobre sua loja..."
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={handleSubmit} disabled={!isValid}>
                Enviar interesse
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
