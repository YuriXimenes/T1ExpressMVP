import type { Metadata } from "next";
import Link from "next/link";
import { Lock, PackageCheck, Radar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { BentoShowcase } from "@/components/sections/bento-showcase";

export const metadata: Metadata = {
  title: "Segurança",
};

const pillars = [
  {
    icon: ShieldCheck,
    title: "Seguro total para sua coleção",
    description:
      "Todo envio conta com cobertura contra extravio ou dano, dimensionada pelo valor declarado das cartas.",
  },
  {
    icon: Radar,
    title: "Rastreamento avançado",
    description:
      "Acompanhe cada etapa do envio em tempo real, da coleta na loja de origem até a retirada final.",
  },
  {
    icon: PackageCheck,
    title: "Embalagens especiais TCG",
    description:
      "Materiais desenvolvidos para proteger cartas contra umidade, dobras e impactos durante o transporte.",
  },
  {
    icon: Lock,
    title: "Dados protegidos",
    description:
      "Informações de pedidos e clientes tratadas com criptografia e controles de acesso rigorosos.",
  },
];

export default function SegurancaPage() {
  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-balance text-slate-900 sm:text-4xl">
            Segurança em cada etapa do envio
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Da embalagem ao rastreamento, a T1 Express foi construída para proteger o que
            há de mais valioso na sua coleção.
          </p>
        </div>

        <div className="mt-12">
          <BentoShowcase
            eyebrow="Envio seguro T1"
            title="Proteção em cada etapa do envio"
            description="Cobertura, rastreamento e embalagens especializadas para seus produtos chegarem com segurança do início ao fim."
            imageSrc="/images/seguranca/security-illustration.png"
            imagePositionMobile="65% 60%"
            imagePositionDesktop="0% 42%"
            cta={
              <Button
                size="lg"
                className="text-brand-700 mx-auto mt-4 w-fit bg-white px-7 text-base font-semibold shadow-lg shadow-black/20 hover:bg-white/90 sm:mx-0"
                asChild
              >
                <Link href="/simular-frete">Simular frete</Link>
              </Button>
            }
            benefits={pillars}
          />
        </div>
      </Container>
    </section>
  );
}
