import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { LoopVideo } from "@/components/shared/loop-video";

export function HeroSection() {
  return (
    <section className="from-brand-700 via-brand-800 to-brand-950 relative bg-gradient-to-br pt-12 pb-16 text-white sm:pt-14 lg:pb-20">
      <Container className="grid items-center gap-12 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h1 className="text-4xl font-bold text-balance sm:text-5xl lg:text-6xl">
            A loja fica longe. Suas cartas não precisam ficar.
          </h1>
          <p className="text-brand-100 mt-6 max-w-lg text-lg">
            Envios rápidos e seguros de Trading Card Games entre lojas parceiras. Conecte
            sua coleção sem fronteiras.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button
              size="lg"
              className="text-brand-700 bg-white px-7 text-base font-semibold shadow-lg shadow-black/20 hover:bg-white/90"
              asChild
            >
              <Link href="/simular-frete">Simule agora</Link>
            </Button>
            <Button variant="invert" size="lg" className="px-6" asChild>
              <Link href="/pontos-t1">Ver pontos T1</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl lg:col-span-3 lg:max-w-none">
          <LoopVideo src="/videos/hero-delivery.mp4" blend="screen" />
        </div>
      </Container>
    </section>
  );
}
