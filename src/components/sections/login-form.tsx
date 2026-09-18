"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { AccountError } from "@/lib/account";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <form
        id="login-form"
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const email = (form.elements.namedItem("email") as HTMLInputElement).value;
          const password = (form.elements.namedItem("password") as HTMLInputElement)
            .value;
          setIsSubmitting(true);
          setError(null);
          try {
            await signIn(email.trim(), password);
            router.push(next || "/conta");
          } catch (err) {
            setError(
              err instanceof AccountError
                ? err.message
                : "Não foi possível entrar. Tente novamente.",
            );
            setIsSubmitting(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
        <p className="text-sm text-slate-600">
          Não tem conta?{" "}
          <Link
            href={`/criar-conta${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-brand-600 font-medium hover:underline"
          >
            Criar conta
          </Link>
        </p>

        <Button type="submit" form="login-form" size="lg" disabled={isSubmitting}>
          Entrar
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
