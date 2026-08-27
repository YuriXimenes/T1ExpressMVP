import { PackageCheck, Radar, ShieldCheck } from "lucide-react";
import { Section } from "@/components/shared/section";
import { SectionHeading } from "@/components/shared/section-heading";
import { IconFeature } from "@/components/shared/icon-feature";
import { TrackingSteps } from "@/components/shared/tracking-steps";

const trackingSteps = [
  { label: "Coletado", status: "done" as const },
  { label: "Em trânsito", status: "done" as const },
  { label: "Chegou no Ponto T1", status: "current" as const },
  { label: "Entregue", status: "pending" as const },
];

const highlights = [
  {
    icon: ShieldCheck,
    title: "Seguro total",
    description: "Cobertura completa para sua coleção.",
  },
  {
    icon: Radar,
    title: "Rastreamento avançado",
    description: "Acompanhe cada etapa em tempo real.",
  },
  {
    icon: PackageCheck,
    title: "Embalagens especiais TCG",
    description: "Proteção pensada para cartas colecionáveis.",
  },
];

export function TrackingSection() {
  return (
    <Section background="brand">
      <SectionHeading
        kicker="Tecnologia e Segurança"
        title="Acompanhe seu envio em tempo real"
        invert
      />

      <div className="mt-12 rounded-2xl bg-white/10 p-6 sm:p-8">
        <p className="text-brand-100 text-sm font-medium">Pedido #T1-1842</p>
        <div className="mt-6">
          <TrackingSteps steps={trackingSteps} />
        </div>
      </div>

      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        {highlights.map((item) => (
          <IconFeature key={item.title} {...item} invert />
        ))}
      </div>
    </Section>
  );
}
