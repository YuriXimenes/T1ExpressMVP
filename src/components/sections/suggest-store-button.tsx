"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LeadError, submitStoreSuggestion } from "@/lib/leads";

export function SuggestStoreButton() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot: só um robô preenche

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          // Reseta o formulário depois que o fechamento termina de animar.
          setTimeout(() => {
            setSubmitted(false);
            setSubmitError(null);
            setWebsite("");
          }, 200);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="mt-8 px-6">
          Enviar sugestão
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="bg-brand-50 flex h-12 w-12 items-center justify-center rounded-full">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="text-brand-600 h-6 w-6"
                aria-hidden="true"
              >
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <DialogTitle>Sugestão enviada!</DialogTitle>
            <DialogDescription>
              Nosso time já recebeu sua indicação e agradece o interesse em ver essa loja
              na rede T1 Express.
            </DialogDescription>
            <Button variant="outline" className="mt-2" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Sugira uma loja parceira</DialogTitle>
              <DialogDescription>
                Toda sugestão nos ajuda a decidir onde expandir a rede T1. Conte pra gente
                qual loja você gostaria de ver como parceira. O endereço ajuda nosso time
                a avaliar a região mais rápido.
              </DialogDescription>
            </DialogHeader>

            <form
              method="post"
              className="flex flex-col gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (isSubmitting) return;
                const form = event.currentTarget;
                const value = (name: string) =>
                  (form.elements.namedItem(name) as HTMLInputElement).value;
                setIsSubmitting(true);
                setSubmitError(null);
                try {
                  await submitStoreSuggestion({
                    storeName: value("store-name").trim(),
                    storeAddress: value("store-address").trim(),
                    comment: value("comment").trim() || undefined,
                    website,
                  });
                  setSubmitted(true);
                } catch (err) {
                  setSubmitError(
                    err instanceof LeadError
                      ? err.message
                      : "Não foi possível enviar. Tente novamente.",
                  );
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="suggest-store-name">Nome da loja</Label>
                <Input id="suggest-store-name" name="store-name" type="text" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="suggest-store-address">Endereço da loja</Label>
                <Input
                  id="suggest-store-address"
                  name="store-address"
                  type="text"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="suggest-store-comment">
                  Comentário <span className="text-slate-400">(opcional)</span>
                </Label>
                <Textarea id="suggest-store-comment" name="comment" rows={3} />
              </div>

              {/* Campo armadilha contra robôs: invisível e fora da navegação por teclado. */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <Input
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>

              {submitError && (
                <p role="alert" className="text-sm text-red-600">
                  {submitError}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="mt-2 w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Enviando..." : "Enviar sugestão"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
