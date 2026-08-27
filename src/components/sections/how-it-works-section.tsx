import { Card } from "@/components/ui/card";
import { Section } from "@/components/shared/section";
import { SectionHeading } from "@/components/shared/section-heading";
import { PurchaseIllustration } from "@/components/illustrations/purchase-illustration";
import { TransportIllustration } from "@/components/illustrations/transport-illustration";
import { PickupIllustration } from "@/components/illustrations/pickup-illustration";

const steps = [
  {
    illustration: PurchaseIllustration,
    title: "1. Compra",
    description:
      "Você compra cartas em qualquer loja parceira da rede T1, online ou presencialmente.",
  },
  {
    illustration: TransportIllustration,
    title: "2. Transporte",
    description:
      "Coletamos o pedido e cuidamos de todo o transporte com embalagem especializada e rastreamento.",
  },
  {
    illustration: PickupIllustration,
    title: "3. Retirada",
    description:
      "Sua coleção chega em segurança no ponto T1 mais próximo, pronta para retirada.",
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

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {steps.map((step) => (
          <Card key={step.title} className="items-center gap-4 p-8 text-center">
            <step.illustration className="h-40 w-full" />
            <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
            <p className="text-sm text-slate-600">{step.description}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
