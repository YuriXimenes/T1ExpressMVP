"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { LoginAccessPanel } from "@/components/illustrations/login-access-panel";
import { LoginForm } from "@/components/sections/login-form";

export function LoginView({ next }: { next?: string }) {
  const router = useRouter();
  const { isLoggedIn, isReady } = useAuth();

  useEffect(() => {
    if (isReady && isLoggedIn) router.replace("/conta");
  }, [isReady, isLoggedIn, router]);

  if (isLoggedIn) return null;

  return (
    <div className="mx-auto flex min-h-[620px] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5">
      <LoginAccessPanel className="hidden w-[38%] md:flex" />

      <div className="flex w-full flex-col justify-center p-6 sm:p-8 md:w-[62%]">
        <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
        <p className="mt-1 text-sm text-slate-600">
          Acesse sua conta de loja parceira ou cliente T1 Express.
        </p>
        <div className="mt-6">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
