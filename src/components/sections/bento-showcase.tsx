import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { FeatureCard } from "@/components/shared/feature-card";

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function BentoShowcase({
  eyebrow,
  title,
  description,
  imageSrc,
  imagePositionMobile = "50% 50%",
  imagePositionDesktop = "50% 50%",
  imageLayout = "split",
  cta,
  benefits,
}: {
  eyebrow: string;
  title: string;
  description: string;
  imageSrc: string;
  /** Posição do object-position (ex.: "25% 42%") — ajusta o corte do object-cover conforme a composição de cada ilustração. */
  imagePositionMobile?: string;
  imagePositionDesktop?: string;
  /**
   * "split": texto e ilustração em colunas lado a lado (recorte por object-cover).
   * "bleed": ilustração completa (sem corte) atrás de tudo, ancorada à direita do card;
   * o texto ocupa a área que sobra à esquerda, sem sobrepor a ilustração.
   */
  imageLayout?: "split" | "bleed";
  cta: ReactNode;
  benefits: Benefit[];
}) {
  const content = (
    <>
      <p className="text-brand-100 text-xs font-semibold tracking-wide uppercase">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-bold text-balance lg:text-3xl">{title}</h3>
      <p className="text-brand-100 mt-2 text-sm text-balance">{description}</p>
      {cta}
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
      <Card className="group from-brand-700 via-brand-800 to-brand-950 relative gap-0 overflow-hidden border-0 bg-gradient-to-br p-0 text-white ring-0">
        {/* Mobile: illustration on top (fully visible), text below on the solid gradient. */}
        <div className="sm:hidden">
          <div className="animate-pulse-soft-slow relative h-48 w-full transition-transform duration-300 group-hover:scale-105">
            <Image
              src={imageSrc}
              alt=""
              fill
              className="object-cover"
              style={{ objectPosition: imagePositionMobile }}
              sizes="100vw"
            />
          </div>
          <div className="flex flex-col gap-1 p-6 text-left">{content}</div>
        </div>

        {imageLayout === "bleed" ? (
          /* Tablet/desktop: full, uncropped illustration behind everything, anchored to
             the right — the text sits in the space that's naturally left clear. */
          <div className="relative hidden min-h-[320px] sm:block sm:flex-1 lg:min-h-0">
            <div className="animate-pulse-soft-slow pointer-events-none absolute top-1/2 right-4 h-40 w-40 -translate-y-1/2 transition-transform duration-300 group-hover:scale-105 sm:right-6 sm:h-52 sm:w-52 lg:right-8 lg:h-64 lg:w-64">
              <Image
                src={imageSrc}
                alt=""
                fill
                className="object-contain"
                sizes="(min-width: 1024px) 256px, (min-width: 640px) 208px, 160px"
              />
            </div>
            <div className="relative z-10 flex h-full max-w-2xs flex-col justify-center gap-1 p-8 text-left lg:p-10">
              {content}
            </div>
          </div>
        ) : (
          /* Tablet/desktop: text and illustration side by side, illustration filling its half edge-to-edge. */
          <div className="hidden min-h-[320px] sm:flex sm:flex-1 lg:min-h-0">
            <div className="flex flex-col justify-center gap-1 p-8 text-left sm:w-[54%] lg:w-[50%] lg:p-10">
              {content}
            </div>
            <div className="relative sm:w-[46%] lg:w-[50%]">
              <Image
                src={imageSrc}
                alt=""
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ objectPosition: imagePositionDesktop }}
                sizes="(min-width: 1024px) 30vw, 40vw"
              />
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {benefits.map((benefit) => (
          <FeatureCard key={benefit.title} {...benefit} />
        ))}
      </div>
    </div>
  );
}
