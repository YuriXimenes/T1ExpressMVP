import type { Metadata } from "next";
import { MapPin, Plug, TrendingUp, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { BentoShowcase } from "@/components/sections/bento-showcase";
import { PartnerInterestDialog } from "@/components/sections/partner-interest-dialog";

export const metadata: Metadata = {
  title: "Para lojas",
};

const benefits = [
  {
    icon: TrendingUp,
    title: "Aumente seu alcance",
    description:
      "Conecte sua loja a novos clientes em diferentes regiões do Rio de Janeiro.",
  },
  {
    icon: Truck,
    title: "Operação simples para sua loja",
    description:
      "A T1 cuida da coleta e do transporte dos pedidos, sem complicar a rotina da sua equipe.",
  },
  {
    icon: MapPin,
    title: "Melhor experiência para seus clientes",
    description:
      "Seus clientes escolhem um ponto parceiro para retirar seus pedidos de forma prática e segura.",
  },
  {
    icon: Plug,
    title: "Sem estrutura adicional",
    description:
      "Amplie suas opções de entrega e retirada sem precisar criar novos pontos ou investir em uma operação própria.",
  },
];

export default function ParaLojasPage() {
  return (
    <section className="relative flex flex-1 flex-col justify-center overflow-hidden bg-slate-50 py-12 md:py-16">
      <InteractiveGridBackground />

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-balance text-slate-900 sm:text-4xl">
            Sua loja pode fazer parte da rota T1
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Torne-se um Ponto T1 e conecte sua loja a colecionadores e outras lojas
            parceiras no Rio de Janeiro.
          </p>
        </div>

        <div className="mt-12">
          <BentoShowcase
            eyebrow="Ponto parceiro T1"
            title="Faça parte da T1 Network"
            description="Integre-se a uma rede de lojas parceiras que está construindo uma nova experiência para o mercado TCG no Rio e, futuramente, Brasil."
            imageSrc="/images/for-shops/partner-network-illustration.png"
            imagePositionDesktop="100% 50%"
            imageLayout="bleed"
            cta={
              <PartnerInterestDialog
                trigger={
                  <Button
                    size="lg"
                    className="text-brand-700 mx-auto mt-4 w-fit bg-white px-7 text-base font-semibold shadow-lg shadow-black/20 hover:bg-white/90 sm:mx-0"
                  >
                    Quero ser um Ponto T1
                  </Button>
                }
              />
            }
            benefits={benefits}
          />
        </div>

        <p className="mt-8 flex items-center justify-center gap-1.5 text-sm text-slate-500">
          <MapPin className="text-brand-600 h-4 w-4 shrink-0" aria-hidden="true" />
          Hoje a T1 Express atua no Rio de Janeiro — nosso objetivo é expandir para todo o
          Brasil.
        </p>
      </Container>
    </section>
  );
}
