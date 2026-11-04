import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { PesquisaView } from "@/components/sections/pesquisa-view";

export const metadata: Metadata = {
  title: "Pesquisa",
  robots: { index: false, follow: false },
};

export default function PesquisaPage() {
  return (
    <section className="relative flex flex-1 flex-col overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <PesquisaView />
      </Container>
    </section>
  );
}
