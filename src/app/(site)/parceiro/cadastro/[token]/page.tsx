import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { PartnerOnboardingView } from "@/components/sections/partner-onboarding-view";

export const metadata: Metadata = {
  title: "Cadastro de parceiro",
  robots: { index: false, follow: false },
};

export default async function PartnerOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <section className="bg-slate-50 py-10 md:py-14">
      <Container>
        <PartnerOnboardingView token={token} />
      </Container>
    </section>
  );
}
