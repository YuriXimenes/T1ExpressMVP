import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { PagamentoView } from "@/components/sections/pagamento-view";

export const metadata: Metadata = {
  title: "Pagamento",
};

export default async function PagamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; extraCharge?: string }>;
}) {
  const { order, extraCharge } = await searchParams;

  return (
    <section className="relative overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <PagamentoView orderId={order ?? null} extraChargeId={extraCharge ?? null} />
      </Container>
    </section>
  );
}
