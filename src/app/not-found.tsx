import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/shared/section";

export default function NotFound() {
  return (
    <Section background="white" className="text-center">
      <p className="text-brand-600 text-sm font-semibold">404</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
        Página não encontrada
      </h1>
      <p className="mt-4 text-slate-600">
        O endereço que você tentou acessar não existe ou foi movido.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">Voltar para a home</Link>
        </Button>
      </div>
    </Section>
  );
}
