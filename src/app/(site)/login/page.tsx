import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { LoginView } from "@/components/sections/login-view";

export const metadata: Metadata = {
  title: "Login",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <section className="relative overflow-hidden bg-slate-50 py-10 md:py-14">
      <InteractiveGridBackground />

      <Container className="relative">
        <LoginView next={next} />
      </Container>
    </section>
  );
}
