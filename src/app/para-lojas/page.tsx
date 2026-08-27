import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, PackageCheck, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/shared/section";
import { StubPageHero } from "@/components/shared/stub-page-hero";
import { IconFeature } from "@/components/shared/icon-feature";

export const metadata: Metadata = {
  title: "Para lojas",
};

const benefits = [
  {
    icon: TrendingUp,
    title: "Aumente seu alcance",
    description:
      "Venda para colecionadores de todo o Brasil sem se preocupar com logística.",
  },
  {
    icon: PackageCheck,
    title: "Logística simplificada",
    description: "Coleta, transporte e rastreamento cuidados de ponta a ponta pela T1.",
  },
  {
    icon: Wallet,
    title: "Pagamento facilitado",
    description: "Repasses simples e previsíveis, integrados ao seu fluxo de vendas.",
  },
  {
    icon: Handshake,
    title: "Comunidade T1 Network",
    description: "Faça parte da maior rede de lojas de TCG do país.",
  },
];

export default function ParaLojasPage() {
  return (
    <Section background="muted">
      <StubPageHero
        title="Sua loja pode fazer parte da rota T1"
        description="Torne-se um Ponto T1 e conecte sua loja a colecionadores e outras lojas parceiras em todo o Brasil."
        inProgress
      />

      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        {benefits.map((benefit) => (
          <IconFeature
            key={benefit.title}
            {...benefit}
            className="items-start text-left"
          />
        ))}
      </div>

      <div className="mt-12 text-center">
        <Button size="lg" className="px-6" asChild>
          <Link href="/login">Quero ser um Ponto T1</Link>
        </Button>
        <p className="mt-4 text-sm text-slate-500">
          O formulário completo de cadastro de lojas estará disponível em breve.
        </p>
      </div>
    </Section>
  );
}
