import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { AuthCard } from "@/components/shared/auth-card";
import { ForgotPasswordForm } from "@/components/sections/forgot-password-form";

export const metadata: Metadata = {
  title: "Esqueci minha senha",
};

export default function ForgotPasswordPage() {
  return (
    <section className="relative overflow-hidden bg-slate-50 py-10 md:py-14">
      <InteractiveGridBackground />

      <Container className="relative">
        <AuthCard
          title="Esqueci minha senha"
          description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
        >
          <ForgotPasswordForm />
        </AuthCard>
      </Container>
    </section>
  );
}
