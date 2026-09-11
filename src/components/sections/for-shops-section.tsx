import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { FloatParallax } from "@/components/shared/float-parallax";
import { SuggestStoreButton } from "@/components/sections/suggest-store-button";

export function ForShopsSection() {
  return (
    <section className="grid grid-cols-1 bg-white md:grid-cols-2">
      <div className="relative flex flex-col items-center justify-center px-6 py-10 text-center sm:py-12 md:pl-36 lg:pl-52">
        <FloatParallax
          className="pointer-events-none absolute top-2 left-6 z-0 hidden p-6 md:flex md:items-center md:justify-center lg:top-2 lg:left-10 lg:p-8"
          intensity={14}
        >
          <Image
            src="/images/for-shops/partnership-illustration.webp"
            alt=""
            width={1000}
            height={1010}
            className="h-auto w-44 rotate-[10deg] drop-shadow-xl lg:w-60"
            sizes="240px"
          />
        </FloatParallax>

        <div className="relative z-10 flex flex-col items-center">
          <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
            Ponto de coleta
          </p>
          <h2 className="mt-2 max-w-sm text-2xl font-bold text-slate-900 sm:text-3xl">
            Sua loja pode fazer parte da rota T1
          </h2>
          <p className="mt-4 max-w-sm text-slate-600">
            Seja um Ponto T1, amplie seu alcance e conecte-se com colecionadores em todo o
            Brasil, com logística simplificada e pagamentos facilitados.
          </p>
          <Button size="lg" className="mt-8 px-6" asChild>
            <Link href="/para-lojas">Seja um Ponto T1</Link>
          </Button>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center border-t border-slate-200 bg-slate-100 px-6 py-10 text-center sm:py-12 md:border-t-0 md:border-l md:pr-36 lg:pr-52">
        <FloatParallax
          className="pointer-events-none absolute top-2 right-6 z-0 hidden p-6 md:flex md:items-center md:justify-center lg:top-2 lg:right-10 lg:p-8"
          intensity={14}
        >
          <Image
            src="/images/for-shops/client-illustration.webp"
            alt=""
            width={1000}
            height={1010}
            className="h-auto w-44 -rotate-[8deg] drop-shadow-xl lg:w-60"
            sizes="240px"
          />
        </FloatParallax>

        <div className="relative z-10 flex flex-col items-center">
          <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
            Sugestão de loja
          </p>
          <h2 className="mt-2 max-w-sm text-2xl font-bold text-slate-900 sm:text-3xl">
            Sua loja de interesse não está na rota T1?
          </h2>
          <p className="mt-4 max-w-sm text-slate-600">
            Indique o nome da loja. Ela pode entrar como nova parceira ou, se já fizer
            parte da rede, virar um ponto de retirada.
          </p>
          <SuggestStoreButton />
        </div>
      </div>
    </section>
  );
}
