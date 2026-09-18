import type { ReactNode } from "react";
import { LoginAccessPanel } from "@/components/illustrations/login-access-panel";

/** Cartão de duas colunas das telas de acesso (mesmo visual do login). */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[520px] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5">
      <LoginAccessPanel className="hidden w-[38%] md:flex" />

      <div className="flex w-full flex-col justify-center p-6 sm:p-8 md:w-[62%]">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
