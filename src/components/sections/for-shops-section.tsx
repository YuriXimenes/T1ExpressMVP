import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/shared/section";

export function ForShopsSection() {
  return (
    <Section background="muted">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
          For Shops
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
          Sua loja pode fazer parte da rota T1
        </h2>
        <p className="mt-4 text-lg text-slate-600">
          Seja um Ponto T1, amplie seu alcance e conecte-se com colecionadores em todo o
          Brasil, com logística simplificada e pagamentos facilitados.
        </p>
        <div className="mt-8">
          <Button size="lg" className="px-6" asChild>
            <Link href="/para-lojas">Seja um Ponto T1</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
