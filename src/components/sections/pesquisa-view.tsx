"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

/** Provisória: o formulário da pesquisa entra no lugar disto no próximo passo. */
export function PesquisaView() {
  const router = useRouter();
  const { isLoggedIn, isReady } = useAuth();

  useEffect(() => {
    if (isReady && !isLoggedIn) router.replace("/login?next=%2Fpesquisa");
  }, [isReady, isLoggedIn, router]);

  if (!isLoggedIn) return null;

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <ClipboardList className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Pesquisa</h1>
      <p className="mt-2 text-slate-600">
        Estamos preparando as perguntas. Em breve você poderá responder por aqui. Obrigado
        pelo interesse!
      </p>
      <Button className="mt-6" asChild>
        <Link href="/conta">Voltar para minha conta</Link>
      </Button>
    </div>
  );
}
