"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div>
      <form
        id="login-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const email = (form.elements.namedItem("email") as HTMLInputElement).value;
          setIsSubmitting(true);
          login({ name: email.split("@")[0], email });
          router.push(next || "/conta");
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
