"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usesSiteV2, type SiteV2Area } from "@/lib/site-v2/areas";
import { anton } from "@/components/site-v2/fonts";

/**
 * Escolhe a moldura (cabeçalho + rodapé) pela área da página:
 * área ligada em SITE_V2_AREAS → moldura nova dentro de .site-v2; senão → a atual.
 * As duas molduras chegam prontas do servidor; aqui só se escolhe qual mostrar.
 */
export function FrameSwitch({
  areas,
  isStaging,
  current,
  next,
  children,
}: {
  areas: SiteV2Area[];
  isStaging: boolean;
  current: { header: React.ReactNode; footer: React.ReactNode };
  next: { header: React.ReactNode; footer: React.ReactNode };
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const v2 = usesSiteV2(pathname, areas, isStaging);

  const skip = (
    <a href="#main-content" className="skip-link">
      Pular para o conteúdo
    </a>
  );

  if (!v2) {
    return (
      <>
        {skip}
        {current.header}
        <main id="main-content" className="flex flex-1 flex-col">
          {children}
        </main>
        {current.footer}
      </>
    );
  }

  return (
    <div className={cn("site-v2 flex flex-1 flex-col text-[15px] leading-[1.55]", anton.variable)} data-site="v2">
      {skip}
      {next.header}
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      {next.footer}
    </div>
  );
}
