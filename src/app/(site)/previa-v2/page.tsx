import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { IS_STAGING } from "@/lib/app-env";
import { PageHero } from "@/components/site-v2/page-hero";
import { V2Section, SectionHead } from "@/components/site-v2/section";
import { PillButton, PillLink } from "@/components/site-v2/pill";
import { V2Card, V2CardTitle } from "@/components/site-v2/card";
import { V2Badge, V2Status } from "@/components/site-v2/badge";
import { DisplayHeading, Eyebrow } from "@/components/site-v2/heading";
import { PreviewForm } from "./preview-form";

export const metadata: Metadata = {
  title: "Prévia do layout novo",
  robots: { index: false, follow: false },
};

// Vitrine da Fase 1 (base visual). Existe só no ambiente de testes: em produção dá 404.
export default function PreviaV2Page() {
  if (!IS_STAGING) notFound();

  return (
    <>
      <PageHero
        eyebrow="Fase 1 · base visual"
        title="Prévia do layout novo"
        lead="Componentes de base do site novo, com o cabeçalho e o rodapé novos. Só aparece no ambiente de testes; o site continua igual até cada área ser ligada."
        actions={
          <>
            <PillLink href="/simular-frete">
              Simular frete <ArrowRight aria-hidden="true" />
            </PillLink>
            <PillLink href="/pontos-t1" variant="ghost">
              Ver pontos
            </PillLink>
          </>
        }
      />

      <V2Section labelledBy="pv-botoes">
        <SectionHead eyebrow="Botões" title="Pílulas" titleId="pv-botoes" />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PillButton>Azul</PillButton>
          <PillButton variant="ghost">Contorno</PillButton>
          <PillButton variant="line">Linha</PillButton>
          <PillButton variant="danger">Perigo</PillButton>
          <PillButton size="sm">Pequeno</PillButton>
          <PillButton disabled>Desativado</PillButton>
          <span className="rounded-t1 bg-t1-navy p-3">
            <PillButton variant="white">Branco</PillButton>
          </span>
        </div>
      </V2Section>

      <V2Section labelledBy="pv-titulos">
        <SectionHead
          eyebrow="Tipografia"
          title="Títulos e selos"
          titleId="pv-titulos"
          lead="Títulos em Anton (caixa alta) e texto em Inter, como no protótipo."
        />
        <div className="mt-6 grid gap-4">
          <DisplayHeading as="p" size="xl">
            Várias lojas. Uma só retirada.
          </DisplayHeading>
          <DisplayHeading as="p" size="md">
            Título de cartão
          </DisplayHeading>
          <Eyebrow>Rótulo acima do título</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <V2Badge>Novo</V2Badge>
            <V2Badge tone="ok">Grátis</V2Badge>
            <V2Badge tone="warn">Atenção</V2Badge>
            <V2Badge tone="danger">Erro</V2Badge>
            <V2Badge tone="neutral">Neutro</V2Badge>
            <V2Badge tone="violet">Central</V2Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <V2Status tone="warn">Aguardando pagamento</V2Status>
            <V2Status tone="neutral">Aguardando coleta</V2Status>
            <V2Status pulse>Em transporte</V2Status>
            <V2Status tone="violet">Recebido na central</V2Status>
            <V2Status tone="ok">Disponível para retirada</V2Status>
            <V2Status tone="danger">Cancelado</V2Status>
          </div>
        </div>
      </V2Section>

      <V2Section labelledBy="pv-cartoes">
        <SectionHead eyebrow="Cartões" title="Superfícies" titleId="pv-cartoes" />
        <div className="mt-6 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          <V2Card>
            <V2CardTitle>Simples</V2CardTitle>
            <p className="mt-2 text-sm text-t1-muted">Cartão padrão, borda fina.</p>
          </V2Card>
          <V2Card tone="raised">
            <V2CardTitle>Elevado</V2CardTitle>
            <p className="mt-2 text-sm text-t1-muted">Com sombra maior.</p>
          </V2Card>
          <V2Card tone="line">
            <V2CardTitle>Destaque</V2CardTitle>
            <p className="mt-2 text-sm text-t1-muted">Contorno azul.</p>
          </V2Card>
          <V2Card tone="sunken">
            <p className="text-sm text-t1-muted">Recuado, para blocos dentro de cartões.</p>
          </V2Card>
          <V2Card tone="blue">
            <V2CardTitle>Azul</V2CardTitle>
            <p className="mt-2 flex items-center gap-2 text-sm">
              <MapPin className="size-4" aria-hidden="true" /> Para chamadas fortes.
            </p>
          </V2Card>
        </div>
      </V2Section>

      <V2Section labelledBy="pv-form">
        <SectionHead eyebrow="Formulário" title="Campos e diálogo" titleId="pv-form" />
        <PreviewForm />
      </V2Section>
    </>
  );
}
