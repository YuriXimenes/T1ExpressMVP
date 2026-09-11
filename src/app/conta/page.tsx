import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { ContaView } from "@/components/sections/conta-view";

export const metadata: Metadata = {
  title: "Minha conta",
};

export default function ContaPage() {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <ContaView />
      </Container>
    </section>
  );
}
