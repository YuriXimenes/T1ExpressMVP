"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountError, requestPasswordReset } from "@/lib/account";

const RESEND_WAIT_SECONDS = 30;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function send() {
    const address = email.trim();
    if (!address || isSending || wait > 0) return;
    setIsSending(true);
    setError(null);
    try {
      await requestPasswordReset(address);
      setSentTo(address);
      setWait(RESEND_WAIT_SECONDS);
    } catch (err) {
      setError(
        err instanceof AccountError
          ? err.message
          : "Não foi possível enviar o link. Tente novamente.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      {sentTo ? (
        <div
          role="status"
          className="flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Se houver uma conta com <strong>{sentTo}</strong>, enviamos um link para criar
            uma nova senha. Confira também a caixa de spam.
          </p>
        </div>
      ) : null}

      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail da conta</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={isSending || wait > 0}>
          {isSending
            ? "Enviando..."
            : wait > 0
              ? `Reenviar em ${wait}s`
              : sentTo
                ? "Reenviar link"
                : "Enviar link"}
        </Button>
      </form>

      <p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">
        Lembrou a senha?{" "}
        <Link href="/login" className="text-brand-600 font-medium hover:underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
