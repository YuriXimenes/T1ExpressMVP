import type { Metadata } from "next";
import { Container } from "@/components/shared/container";
import { InteractiveGridBackground } from "@/components/shared/interactive-grid-background";
import { TcgCardsPanel } from "@/components/illustrations/tcg-cards-panel";
import { CreateAccountForm } from "@/components/sections/create-account-form";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <section className="relative overflow-hidden bg-slate-50 py-10 md:py-14">
      <InteractiveGridBackground />

      <Container className="relative">
        <div className="mx-auto flex min-h-[620px] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5">
          <TcgCardsPanel className="hidden w-[38%] md:flex" />

          <div className="flex w-full flex-col justify-center p-6 sm:p-8 md:w-[62%]">
            <h1 className="text-2xl font-bold text-slate-900">Criar conta</h1>
            <p className="mt-1 text-sm text-slate-600">
              Crie sua conta de cliente para acompanhar pedidos e coletas na T1 Express.
            </p>
            <div className="mt-6">
              <CreateAccountForm next={next} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
