"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <Card className="mt-6 gap-5 p-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
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

        <Button type="submit" size="lg" className="mt-2 w-full">
          Entrar
        </Button>
      </form>

      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-center text-sm text-slate-600"
      >
        {submitted &&
          "Login estará disponível em breve. Estamos preparando essa etapa com foco em segurança."}
      </p>
    </Card>
  );
}
