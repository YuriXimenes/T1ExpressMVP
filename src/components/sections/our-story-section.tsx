import Image from "next/image";
import { Route } from "lucide-react";
import { Card } from "@/components/ui/card";
import { freightStores } from "@/lib/data/freight-stores";

export function OurStorySection() {
  const storeCount = freightStores.length;

  return (
    <Card className="from-brand-700 via-brand-800 to-brand-950 gap-0 overflow-hidden border-0 bg-gradient-to-br p-0 text-white ring-0">
      <div className="flex flex-col-reverse items-center gap-6 p-6 text-center sm:flex-row sm:items-center sm:gap-10 sm:p-8 sm:text-left lg:p-10">
        <div className="min-w-0 flex-1">
          <p className="text-brand-100 text-xs font-semibold tracking-wide uppercase">
            Nossa história
          </p>
          <h2 className="mt-3 text-2xl leading-tight font-bold text-balance sm:text-3xl">
            Feita por quem também já esperou uma carta chegar
          </h2>
          <p className="text-brand-100 mt-4 text-sm leading-relaxed sm:text-base">
            A T1 Express nasceu de uma dor vivida dentro do próprio hobby e compartilhada
            por muitos jogadores: encontrar uma logística que entenda o cuidado que cards
            e colecionáveis exigem e, ao mesmo tempo, facilite compras feitas em
            diferentes lojas.
          </p>
          <p className="text-brand-100 mt-4 text-sm leading-relaxed sm:text-base">
            Depois de validar essa necessidade com jogadores da comunidade, surgiu a ideia
            de criar uma logística especializada em TCG, capaz de centralizar pedidos de
            diferentes lojas em uma única entrega, com mais cuidado, praticidade e um
            custo mais atrativo.
          </p>
          <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <Route className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {storeCount} lojas parceiras já integradas, com rotas diárias dedicadas.
          </div>
        </div>

        <div className="animate-float-y aspect-[1545/1018] w-full shrink-0 sm:w-[320px] lg:w-[420px]">
          <div className="relative h-full w-full transition-transform duration-300 hover:scale-105">
            <Image
              src="/images/sobre/aboutus-illustration.png"
              alt="Entregador T1 Express entregando um pedido a um colecionador"
              fill
              className="object-contain"
              sizes="(min-width: 1024px) 420px, (min-width: 640px) 320px, 100vw"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
