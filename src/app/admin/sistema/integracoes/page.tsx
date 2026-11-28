import type { Metadata } from "next";
import { APP_ENV, supabaseProjectRef } from "@/lib/app-env";
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
        appEnv: APP_ENV,
        supabaseRef: supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
      }}
    />
  );
}
