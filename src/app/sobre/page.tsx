import type { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  Eye,
  HeartHandshake,
  PackageCheck,
  Route,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { FeatureCard } from "@/components/shared/feature-card";
import { SectionHeading } from "@/components/shared/section-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OurStorySection } from "@/components/sections/our-story-section";
import { StoreLogosSection } from "@/components/sections/store-logos-section";
import { storeLogos } from "@/lib/data/store-logos";

export const metadata: Metadata = {
  title: "Sobre",
};

const pillars = [
  {
    icon: Target,
    title: "Missão",
    description:
      "Conectar lojas e colecionadores de TCG com uma logística feita sob medida para cartas colecionáveis por todo Brasil.",
  },
  {
    icon: Eye,
    title: "Visão",
    description:
      "Ser a transportadora de referência do mercado de TCG no Brasil, reconhecida pela segurança e agilidade.",
  },
  {
    icon: HeartHandshake,
    title: "Valores",
    description:
      "Cuidado com cada envio, transparência com lojas e clientes, e paixão genuína pelo universo dos jogos de cartas.",
  },
];

const differentiators = [
  {
    icon: PackageCheck,
    title: "Cuidado especializado",
    description:
      "Sabemos que cada carta pode ter valor financeiro, competitivo ou sentimental. Por isso, todos os pedidos são transportados com o cuidado que uma coleção merece.",
    bullets: [
      "Manuseio cuidadoso durante toda a operação",
      "Transporte pensado especialmente para cards e colecionáveis",
    ],
  },
  {
    icon: Route,
    title: "Rota ponto a ponto entre lojas",
    description:
      "Envios otimizados diretamente entre lojas parceiras. Você retira com agilidade na sua loja habitual.",
    bullets: ["Retirada na loja local", "Janelas de coleta e entrega"],
  },
  {
    icon: ShieldCheck,
    title: "Seguro antiextravio dedicado",
    description:
      "Cobertura com valor real de mercado para cartas raras, itens graduados e caixas lacradas, para máxima tranquilidade.",
    bullets: [
      "Avaliação do valor real colecionável",
      "Protocolo de sinistro rápido e direto",
    ],
  },
];

export default function SobrePage() {
  return (
    <>
      <section className="relative flex flex-1 flex-col justify-center overflow-hidden bg-slate-50 py-12 md:py-16">
        <InteractiveGridBackground />

        <Container className="relative">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-bold text-balance text-slate-900 sm:text-4xl">
              Sobre a T1 Express
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Nascemos da paixão por TCGs para resolver um problema real: fazer suas
              cartas chegarem rápido e em segurança, esteja a loja perto ou longe.
            </p>
          </div>

          <div className="mt-12">
            <OurStorySection />
          </div>

          <div className="mt-16">
            <SectionHeading
              kicker="Nossos princípios"
              title="O compromisso que guia nossas rotas"
            />
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {pillars.map((pillar) => (
                <FeatureCard key={pillar.title} {...pillar} />
              ))}
            </div>
          </div>

          <div className="mt-16">
            <SectionHeading
              kicker="Especialização real"
              title="Por que a T1 Express não é frete comum"
              description="Tratamos cartas raras, decks competitivos e caixas seladas com protocolos logísticos exclusivos."
            />
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {differentiators.map((item) => (
                <Card key={item.title} className="group p-5 sm:p-6">
                  <div className="transition-transform duration-300 group-hover:scale-105">
                    <span
                      className="bg-brand-50 flex h-10 w-10 items-center justify-center rounded-lg"
                      aria-hidden="true"
                    >
                      <item.icon className="text-brand-600 h-5 w-5" />
                    </span>
                    <p className="mt-3 font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                    <ul className="mt-3 space-y-1.5">
                      {item.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="flex items-start gap-1.5 text-xs text-slate-500"
                        >
                          <Check
                            className="text-brand-600 mt-0.5 h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <StoreLogosSection logos={storeLogos} />

      <section className="relative overflow-hidden bg-slate-50 py-12 md:py-16">
        <InteractiveGridBackground />

        <Container className="relative">
          <Card className="bg-brand-50 mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-2xl p-6 text-center ring-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8 sm:text-left">
            <div>
              <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
                Conecte seu estoque
              </p>
              <h2 className="mt-1.5 text-xl font-bold text-slate-900 sm:text-2xl">
                Sua loja quer fazer parte da rota T1 Express?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Reduza custos de frete, garanta entregas em prazo recorde e expanda o
                alcance da sua comunidade de jogadores.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full shrink-0 px-8 text-base sm:w-auto"
              asChild
            >
              <Link href="/para-lojas">Cadastrar minha loja</Link>
            </Button>
          </Card>
        </Container>
      </section>
    </>
  );
}
