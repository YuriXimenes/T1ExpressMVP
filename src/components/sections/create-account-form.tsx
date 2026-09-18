"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Info, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUploader } from "@/components/shared/avatar-uploader";
import { GamesPicker } from "@/components/shared/games-picker";
import { StorePreferencesPicker } from "@/components/shared/store-preferences-picker";
import { useAuth } from "@/lib/auth";
import { useCatalog } from "@/lib/catalog/provider";
import { gameOptions } from "@/lib/data/games";
import { formatPhone } from "@/lib/format-phone";
import { passwordRequirements, isPasswordValid } from "@/lib/password";
import { cn } from "@/lib/utils";
import type { CustomPreferredStore, GameTag } from "@/lib/types/signup";

const steps = ["Seus dados", "Endereço", "Jogatina", "Segurança"];

/** Nomes dos campos nativos (com `required`) de cada etapa, validados antes de avançar. */
const stepFieldNames: string[][] = [
  ["fullName", "email", "phone"],
  ["street", "neighborhood", "city", "state", "zip"],
  [],
  [],
];

interface ReviewData {
  fullName: string;
  email: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  zip: string;
  complement: string;
}

export function CreateAccountForm({ next }: { next?: string }) {
  const router = useRouter();
  const { login } = useAuth();
  const { stores: freightStores } = useCatalog();
  const formRef = useRef<HTMLFormElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [games, setGames] = useState<GameTag[]>([]);
  const [customGames, setCustomGames] = useState<string[]>([]);
  const [preferredStoreIds, setPreferredStoreIds] = useState<string[]>([]);
  const [customStores, setCustomStores] = useState<CustomPreferredStore[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  function validateStep(index: number): boolean {
    if (index === 3) {
      if (!isPasswordValid(password)) {
        setError("A senha não atende aos requisitos mínimos.");
        return false;
      }
      if (!passwordsMatch) {
        setError("As senhas precisam ser exatamente iguais.");
        return false;
      }
      return true;
    }

    const form = formRef.current;
    if (!form) return true;
    for (const name of stepFieldNames[index]) {
      const field = form.elements.namedItem(name) as HTMLInputElement | null;
      if (field && !field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function fieldValue(name: string) {
    const form = formRef.current;
    if (!form) return "";
    return (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
  }

  /** Trava a altura atual, aplica a mudança de etapa e anima até a nova altura. */
  function animateStepChange(update: () => void) {
    const el = contentRef.current;
    if (el) setContentHeight(el.getBoundingClientRect().height);
    requestAnimationFrame(() => {
      // flushSync garante que o DOM já reflita a nova etapa antes de medirmos a altura.
      flushSync(update);
      const nextEl = contentRef.current;
      if (nextEl) setContentHeight(nextEl.scrollHeight);
    });
  }

  function goNext() {
    setError(null);
    if (!validateStep(step)) return;

    if (step === steps.length - 1) {
      const data: ReviewData = {
        fullName: fieldValue("fullName"),
        email: fieldValue("email"),
        street: fieldValue("street"),
        neighborhood: fieldValue("neighborhood"),
        city: fieldValue("city"),
        state: fieldValue("state"),
        zip: fieldValue("zip"),
        complement: fieldValue("complement"),
      };
      animateStepChange(() => {
        setReviewData(data);
        setShowSummary(true);
      });
      return;
    }
    animateStepChange(() => setStep((s) => s + 1));
  }

  function goBack() {
    setError(null);
    animateStepChange(() => {
      if (showSummary) {
        setShowSummary(false);
      } else {
        setStep((s) => Math.max(0, s - 1));
      }
    });
  }

  function handleCreateAccount() {
    if (!reviewData) return;
    login({
      name: reviewData.fullName,
      email: reviewData.email,
      avatarUrl,
      phone,
      address: {
        street: reviewData.street,
        neighborhood: reviewData.neighborhood,
        city: reviewData.city,
        state: reviewData.state,
        zip: reviewData.zip,
        complement: reviewData.complement || undefined,
      },
      games,
      otherGames: games.includes("outro") ? customGames : undefined,
      preferredStoreIds,
      customPreferredStores: customStores.filter(
        (store) => store.name.trim() && store.address.trim(),
      ),
    });
    router.push(next || "/conta");
  }

  const selectedStores = freightStores.filter((store) =>
    preferredStoreIds.includes(store.id),
  );
  const validCustomStores = customStores.filter(
    (store) => store.name.trim() && store.address.trim(),
  );
  const gameLabels = [
    ...games
      .filter((g) => g !== "outro")
      .map((g) => gameOptions.find((o) => o.id === g)!.label),
    ...customGames,
  ];

  return (
    <div>
      {!showSummary && (
        <>
          <div className="mb-5 flex items-center">
            {steps.map((label, index) => (
              <div key={label} className="flex flex-1 items-center last:flex-none">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    index < step
                      ? "bg-brand-600 text-white"
                      : index === step
                        ? "border-brand-600 text-brand-700 border-2"
                        : "bg-slate-100 text-slate-400",
                  )}
                >
                  {index < step ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                {index < steps.length - 1 && (
                  <span
                    className={cn(
                      "mx-2 h-0.5 flex-1 rounded-full",
                      index < step ? "bg-brand-600" : "bg-slate-100",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="mb-4 text-xs font-medium tracking-wide text-slate-400 uppercase">
            Etapa {step + 1} de {steps.length} — {steps[step]}
          </p>
        </>
      )}

      <div
        ref={contentRef}
        className="-m-1.5 overflow-hidden p-1.5 transition-[height] duration-300 ease-in-out"
        style={contentHeight !== undefined ? { height: contentHeight } : undefined}
        onTransitionEnd={() => setContentHeight(undefined)}
      >
        <form ref={formRef} onSubmit={(event) => event.preventDefault()}>
          <section className={cn("space-y-4", (showSummary || step !== 0) && "hidden")}>
            <AvatarUploader
              value={avatarUrl}
              onChange={setAvatarUrl}
              label="Foto (opcional)"
              fallback={<User className="h-10 w-10 text-slate-400" aria-hidden="true" />}
            />

            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="(21)91234-5678"
                  maxLength={14}
                  value={phone}
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  required
                />
              </div>
            </div>
          </section>

          <section className={cn("space-y-4", (showSummary || step !== 1) && "hidden")}>
            <div className="space-y-1.5">
              <Label htmlFor="street">Rua</Label>
              <Input
                id="street"
                name="street"
                type="text"
                autoComplete="street-address"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" name="neighborhood" type="text" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zip">CEP</Label>
                <Input
                  id="zip"
                  name="zip"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">Estado</Label>
                <Input
                  id="state"
                  name="state"
                  type="text"
                  autoComplete="address-level1"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="complement">
                Complemento <span className="text-slate-400">(opcional)</span>
              </Label>
              <Input id="complement" name="complement" type="text" />
            </div>

            <div className="bg-brand-50 flex gap-2.5 rounded-lg p-3 text-sm">
              <Info
                className="text-brand-600 mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p className="text-brand-800">
                Por enquanto a T1 Express atua apenas na cidade do Rio de Janeiro. Você
                pode continuar com o cadastro para acompanhar nossas novidades e ser
                avisado assim que chegarmos à sua região.
              </p>
            </div>
          </section>

          <section className={cn("space-y-6", (showSummary || step !== 2) && "hidden")}>
            <GamesPicker
              games={games}
              setGames={setGames}
              customGames={customGames}
              setCustomGames={setCustomGames}
            />
            <StorePreferencesPicker
              preferredStoreIds={preferredStoreIds}
              setPreferredStoreIds={setPreferredStoreIds}
              customStores={customStores}
              setCustomStores={setCustomStores}
            />
          </section>

          <section className={cn("space-y-4", (showSummary || step !== 3) && "hidden")}>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Repetir senha</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-600">As senhas não coincidem.</p>
              )}
            </div>
          </section>
        </form>

        {showSummary && reviewData && (
          <div className="space-y-5">
            <h3 className="text-sm font-semibold text-slate-900">Confira seus dados</h3>

            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-6 w-6 text-slate-400" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {reviewData.fullName}
                </p>
                <p className="truncate text-sm text-slate-600">{reviewData.email}</p>
                <p className="text-sm text-slate-600">{phone}</p>
              </div>
            </div>

            <div className="space-y-1 rounded-lg border border-slate-100 p-3 text-sm text-slate-600">
              <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                Endereço
              </p>
              <p>
                {reviewData.street} — {reviewData.neighborhood}, {reviewData.city}/
                {reviewData.state}, {reviewData.zip}
                {reviewData.complement ? ` (${reviewData.complement})` : ""}
              </p>
            </div>

            {gameLabels.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                  Jogos
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {gameLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(selectedStores.length > 0 || validCustomStores.length > 0) && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                  Lojas de preferência
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedStores.map((store) => (
                    <span
                      key={store.id}
                      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1.5 text-xs font-medium text-slate-700"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full",
                          store.logoOnDark && "bg-slate-900",
                        )}
                      >
                        <Image
                          src={store.logo}
                          alt=""
                          width={20}
                          height={20}
                          className="h-full w-full object-contain"
                        />
                      </span>
                      {store.name}
                    </span>
                  ))}
                  {validCustomStores.map((store) => (
                    <span
                      key={store.name}
                      className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {store.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
        {step > 0 || showSummary ? (
          <Button type="button" variant="ghost" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Button>
        ) : (
          <p className="text-sm text-slate-600">
            Já tem conta?{" "}
            <Link
              href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="text-brand-600 font-medium hover:underline"
            >
              Entrar
            </Link>
          </p>
        )}

        {showSummary ? (
          <Button type="button" size="lg" onClick={handleCreateAccount}>
            Criar conta
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={goNext}>
            {step === steps.length - 1 ? "Finalizar" : "Próximo"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
