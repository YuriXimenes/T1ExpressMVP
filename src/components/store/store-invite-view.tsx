"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { PartnerError, acceptStoreInvite, previewStoreInvite } from "@/lib/partners/api";

/** /loja/convite/<token>: aceitar o acesso à área de uma loja parceira. */
export function StoreInviteView({ token }: { token: string }) {
  const router = useRouter();
  const { isReady, isLoggedIn, user } = useAuth();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof previewStoreInvite>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/loja/convite/${token}`;

  useEffect(() => {
    let cancelled = false;
    previewStoreInvite(token)
      .then((i) => !cancelled && setInfo(i))
      .catch(() => !cancelled && setInfo({ found: false }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await acceptStoreInvite(token);
      router.replace("/loja");
    } catch (err) {
      setError(err instanceof PartnerError ? err.message : "Não foi possível aceitar.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-4">
      <Card className="flex w-full max-w-md flex-col gap-4 p-6">
        {!info || !isReady ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : !info.found ? (
          <p className="text-slate-700">Convite não encontrado. Confira o link.</p>
        ) : !info.valid ? (
          <p className="text-slate-700">
            Este convite já foi usado ou venceu. Peça um novo.
          </p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Store
                className="text-brand-700 mt-0.5 h-6 w-6 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  Acesso à área da loja {info.storeName}
                </p>
                <p className="text-sm text-slate-600">
                  {info.role === "responsavel" ? "Como responsável" : "Como funcionário"}{" "}
                  da loja parceira da T1 Express.
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
                <Button size="lg" disabled={busy} onClick={() => void accept()}>
                  {busy ? "Aceitando..." : "Aceitar convite"}
                </Button>
              </>
            ) : (
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
            )}
          </>
        )}
      </Card>
    </div>
  );
}
