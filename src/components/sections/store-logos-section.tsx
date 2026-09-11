import { Container } from "@/components/shared/container";
import { LogoMarquee } from "@/components/shared/logo-marquee";
import type { StoreLogo } from "@/lib/types/store-logo";

export function StoreLogosSection({ logos }: { logos: StoreLogo[] }) {
  return (
    <section className="bg-background w-full overflow-hidden py-8 md:py-10">
      <Container>
        <p className="text-center text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Já realizamos coletas nestas lojas parceiras
        </p>
      </Container>
      <div className="mt-8 w-full">
        <LogoMarquee logos={logos} />
      </div>
    </section>
  );
}
