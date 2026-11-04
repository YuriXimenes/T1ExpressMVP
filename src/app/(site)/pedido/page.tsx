import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { PedidoView } from "@/components/sections/pedido-view";

export const metadata: Metadata = {
  title: "Novo pedido",
};

export default function PedidoPage() {
  return (
    <section className="relative overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <PedidoView />
      </Container>
    </section>
  );
}
