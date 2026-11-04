"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabase/client";

interface InviteInfo {
  found: boolean;
  roleName?: string;
  jobTitle?: string;
  state?: "valid" | "used" | "revoked" | "expired";
}

const STATE_MESSAGES: Record<string, string> = {
  used: "Este convite já foi usado.",
  revoked: "Este convite foi cancelado.",
  expired: "Este convite venceu. Peça um novo para quem te convidou.",
};

/** /convite/<token>: aceitar o acesso ao backoffice com o perfil do convite. */
export function StaffInviteView({ token }: { token: string }) {
  const router = useRouter();
  const { isReady, isLoggedIn, user } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/convite/${token}`;

  useEffect(() => {
    let cancelled = false;
    createBrowserClient()
      .rpc("invite_lookup" as never, { p_token: token } as never)
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) setError("Não foi possível abrir o convite.");
        else setInfo(data as InviteInfo);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await createBrowserClient().rpc(
      "accept_staff_invite" as never,
      { p_token: token } as never,
    );
    if (rpcError) {
      setError(
        rpcError.code === "P0001"
          ? rpcError.message
          : "Não foi possível aceitar. Tente de novo.",
      );
      setBusy(false);
      return;
    }
    router.replace("/admin");
  }

  let body: React.ReactNode;
  if (error && !info) {
    body = <p className="text-sm text-red-600">{error}</p>;
  } else if (!info || !isReady) {
    body = <p className="text-sm text-slate-500">Carregando...</p>;
  } else if (!info.found) {
    body = <p className="text-slate-700">Convite não encontrado. Confira o link.</p>;
  } else if (info.state !== "valid") {
    body = <p className="text-slate-700">{STATE_MESSAGES[info.state ?? ""]}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Briefcase
            className="text-brand-700 mt-0.5 h-6 w-6 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="text-lg font-semibold text-slate-900">
              Você foi convidado para o backoffice da T1 Express
            </p>
            <p className="text-sm text-slate-600">
              Perfil: <span className="font-medium">{info.roleName}</span>
              {info.jobTitle && ` · ${info.jobTitle}`}
            </p>
          </div>
        </div>
        {isLoggedIn ? (
          <>
            <p className="text-sm text-slate-600">
              O acesso vai ficar na conta{" "}
              <span className="font-medium">{user?.email}</span>.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Button type="button" size="lg" disabled={busy} onClick={() => void accept()}>
              {busy ? "Aceitando..." : "Aceitar convite"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Para aceitar, entre na sua conta ou crie uma. Depois você volta para esta
              página.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="lg">
                <Link href={`/criar-conta?next=${encodeURIComponent(here)}`}>
                  Criar conta
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`/login?next=${encodeURIComponent(here)}`}>
                  Já tenho conta
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10">
      <Card className="p-6">{body}</Card>
    </div>
  );
}
