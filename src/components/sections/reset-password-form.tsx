"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRequirements } from "@/components/shared/password-requirements";
import { AccountError, updatePassword } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { isPasswordValid } from "@/lib/password";

/**
 * O link do e-mail abre esta tela já com uma sessão de recuperação (o
 * supabase-js a lê da URL e `isReady` só vira true depois disso). Sem sessão,
 * o link é inválido ou expirou.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const { isLoggedIn, isReady } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isReady) {
    return <p className="text-sm text-slate-600">Verificando o link...</p>;
  }

  if (!isLoggedIn) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-red-600">
          Este link é inválido ou expirou. Peça um novo para continuar.
        </p>
        <Button asChild size="lg">
          <Link href="/esqueci-senha">Pedir novo link</Link>
        </Button>
      </div>
    );
  }

  async function handleSubmit() {
    if (isSaving) return;
    if (!isPasswordValid(password)) {
      setError("A senha não atende aos requisitos mínimos.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas precisam ser exatamente iguais.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updatePassword(password);
      router.replace("/conta");
    } catch (err) {
      setError(
        err instanceof AccountError
          ? err.message
          : "Não foi possível alterar a senha. Tente novamente.",
      );
      setIsSaving(false);
    }
  }

  return (
    <form
      method="post"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
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
      <PasswordRequirements password={password} />

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Repetir nova senha</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isSaving}>
        {isSaving ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
