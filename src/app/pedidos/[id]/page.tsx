import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { OrderDetailView } from "@/components/sections/order-detail-view";

export const metadata: Metadata = {
  title: "Detalhes do pedido",
};

export default async function PedidoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <section className="relative overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <OrderDetailView orderId={id} />
      </Container>
    </section>
  );
}
