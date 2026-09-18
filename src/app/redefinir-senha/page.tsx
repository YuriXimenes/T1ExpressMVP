import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { AuthCard } from "@/components/shared/auth-card";
import { ResetPasswordForm } from "@/components/sections/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir senha",
};

export default function ResetPasswordPage() {
  return (
    <section className="relative overflow-hidden bg-slate-50 py-10 md:py-14">
      <InteractiveGridBackground />

      <Container className="relative">
        <AuthCard
          title="Criar nova senha"
          description="Escolha uma nova senha para acessar sua conta T1 Express."
        >
          <ResetPasswordForm />
        </AuthCard>
      </Container>
    </section>
  );
}
