import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/shared/section";
import { SectionHeading } from "@/components/shared/section-heading";
import { StoreCard } from "@/components/shared/store-card";
import type { PartnerStore } from "@/lib/types/store";

export function NetworkSection({ stores }: { stores: PartnerStore[] }) {
  return (
    <Section background="white">
      <SectionHeading
        kicker="T1 Network"
        title="A maior rede de lojas TCG do Brasil"
        description="Lojas parceiras em todo o país, prontas para coletar e receber pedidos com segurança."
      />

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>

      <div className="mt-10 text-center">
        <Button variant="outline" size="lg" asChild>
          <Link href="/pontos-t1">
            Ver diretório completo
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
