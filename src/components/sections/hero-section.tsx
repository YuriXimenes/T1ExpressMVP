import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { HeroIllustration } from "@/components/illustrations/hero-illustration";
import { FreightSimulatorCard } from "@/components/sections/freight-simulator-card";
import type { PartnerStore } from "@/lib/types/store";

export function HeroSection({ stores }: { stores: PartnerStore[] }) {
  return (
    <section className="from-brand-700 via-brand-800 to-brand-950 relative overflow-hidden bg-gradient-to-br pt-16 pb-32 text-white sm:pt-20 lg:pb-44">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold text-balance sm:text-5xl lg:text-6xl">
            A loja fica longe. Suas cartas não precisam ficar.
          </h1>
          <p className="text-brand-100 mt-6 max-w-lg text-lg">
            Envios rápidos e seguros de Trading Card Games entre lojas parceiras. Conecte
            sua coleção sem fronteiras.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button variant="invert" size="lg" className="px-6" asChild>
              <Link href="/simular-frete">Enviar agora</Link>
            </Button>
            <Button variant="invert" size="lg" className="px-6" asChild>
              <Link href="/pontos-t1">Ver pontos T1</Link>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-md items-center justify-center lg:max-w-none">
          <HeroIllustration className="w-full max-w-md" />
          <span className="absolute bottom-16 left-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm sm:left-6">
            Loja A · São Paulo
          </span>
          <span className="absolute top-4 right-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm sm:right-6">
            Loja B · Rio de Janeiro
          </span>
        </div>
      </Container>

      <Container className="relative mt-12 lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:translate-y-1/2">
        <FreightSimulatorCard stores={stores} className="lg:max-w-xl" />
      </Container>
    </section>
  );
}
