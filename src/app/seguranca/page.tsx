import type { Metadata } from "next";
import { Lock, PackageCheck, Radar, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/shared/section";
import { StubPageHero } from "@/components/shared/stub-page-hero";

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
    <Section background="white">
      <StubPageHero
        title="Segurança em cada etapa do envio"
        description="Da embalagem ao rastreamento, a T1 Express foi construída para proteger o que há de mais valioso na sua coleção."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {pillars.map((pillar) => (
          <Card key={pillar.title} className="gap-3 p-6">
            <span className="bg-brand-50 flex h-11 w-11 items-center justify-center rounded-xl">
              <pillar.icon className="text-brand-600 h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="text-lg font-semibold text-slate-900">{pillar.title}</h3>
            <p className="text-sm text-slate-600">{pillar.description}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}
