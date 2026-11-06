import type { Metadata } from "next";
import { IntegracoesView } from "@/components/admin/sistema/integracoes-view";

export const metadata: Metadata = { title: "Integrações" };

export default function AdminIntegracoesPage() {
  // Variáveis que a Vercel preenche no deploy (vazias no localhost).
  return (
    <IntegracoesView
      deploy={{
        env: process.env.VERCEL_ENV,
        commit: process.env.VERCEL_GIT_COMMIT_SHA,
        branch: process.env.VERCEL_GIT_COMMIT_REF,
        message: process.env.VERCEL_GIT_COMMIT_MESSAGE,
      }}
    />
  );
}
