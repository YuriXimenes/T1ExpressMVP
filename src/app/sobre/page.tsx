import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/shared/section";
import { StubPageHero } from "@/components/shared/stub-page-hero";

export const metadata: Metadata = {
  title: "Sobre",
};

const pillars = [
  {
    title: "Missão",
    description:
      "Conectar lojas e colecionadores de TCG em todo o Brasil com uma logística feita sob medida para cartas colecionáveis.",
  },
  {
    title: "Visão",
    description:
      "Ser a transportadora de referência do mercado de TCG na América Latina, reconhecida pela segurança e agilidade.",
  },
  {
    title: "Valores",
    description:
      "Cuidado com cada envio, transparência com lojas e clientes, e paixão genuína pelo universo dos jogos de cartas.",
  },
];

export default function SobrePage() {
  return (
    <Section background="muted">
      <StubPageHero
        title="Sobre a T1 Express"
        description="Nascemos da paixão por TCGs para resolver um problema real: fazer suas cartas chegarem rápido e em segurança, esteja a loja perto ou longe."
        inProgress
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {pillars.map((pillar) => (
          <Card key={pillar.title} className="gap-3 p-6 text-center">
            <h3 className="text-lg font-semibold text-slate-900">{pillar.title}</h3>
            <p className="text-sm text-slate-600">{pillar.description}</p>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-slate-500">
        Nossa história completa, equipe e números da rede T1 chegam em breve.
      </p>
    </Section>
  );
}
