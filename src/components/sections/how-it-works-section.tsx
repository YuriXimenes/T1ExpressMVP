import { Card } from "@/components/ui/card";
import { Section } from "@/components/shared/section";
import { SectionHeading } from "@/components/shared/section-heading";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { LoopVideo } from "@/components/shared/loop-video";
import { RequestIllustration } from "@/components/illustrations/request-illustration";
import { PickupIllustration } from "@/components/illustrations/pickup-illustration";

function CompraVideo({ className }: { className?: string }) {
  return <LoopVideo src="/videos/step1-compra.mp4" className={className} />;
}

function TransporteVideo({ className }: { className?: string }) {
  return <LoopVideo src="/videos/step3-transporte.mp4" className={className} />;
}

const steps = [
  {
    illustration: CompraVideo,
    title: "1. Compra",
    description: "Você compra cartas em qualquer loja parceira da rede T1.",
  },
  {
    illustration: RequestIllustration,
    title: "2. Solicite T1",
    description: "Acesse a plataforma da T1 para simular e solicitar o serviço de frete.",
  },
  {
    illustration: TransporteVideo,
    title: "3. Transporte",
    description: "Coletamos os pedidos e cuidamos de toda a logística.",
  },
  {
    illustration: PickupIllustration,
    title: "4. Retirada",
    description:
      "Seu pedido chega em um parceiro T1, à sua escolha, pronto para retirada.",
  },
];

export function HowItWorksSection() {
  return (
    <Section id="como-funciona" background="muted">
      <SectionHeading
        kicker="Como funciona"
        title="Transporte TCG de ponta a ponta"
        description="Do clique de compra até a retirada na loja, acompanhamos cada etapa do envio das suas cartas."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <ScrollReveal key={step.title} delay={index * 120}>
            <Card className="group h-full items-center gap-4 p-6 text-center transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg">
              <step.illustration className="h-56 w-full transition-transform duration-300 group-hover:scale-105" />
              <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
              <p className="text-sm text-slate-600">{step.description}</p>
            </Card>
          </ScrollReveal>
        ))}
      </div>
    </Section>
  );
}
