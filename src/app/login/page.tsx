import type { Metadata } from "next";
import { Section } from "@/components/shared/section";
import { LoginForm } from "@/components/sections/login-form";

export const metadata: Metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <Section background="white" className="min-h-[calc(100vh-8rem)]">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold text-slate-900">Entrar</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Acesse sua conta de loja parceira ou cliente T1 Express.
        </p>
        <LoginForm />
      </div>
    </Section>
  );
}
