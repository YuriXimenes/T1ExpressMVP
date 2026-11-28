import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { FrameSwitch } from "@/components/site-v2/frame-switch";
import { V2Header } from "@/components/site-v2/header";
import { V2Footer } from "@/components/site-v2/footer";
import type { SiteV2Area } from "@/lib/site-v2/areas";

/**
 * Moldura do site público: cabeçalho, conteúdo e rodapé. O /admin não usa.
 * Sem áreas ligadas (padrão, e na página 404) fica exatamente a moldura atual.
 */
export function SiteFrame({
  children,
  v2Areas = [],
  isStaging = false,
}: {
  children: React.ReactNode;
  v2Areas?: SiteV2Area[];
  isStaging?: boolean;
}) {
  return (
    <FrameSwitch
      areas={v2Areas}
      isStaging={isStaging}
      current={{ header: <Header />, footer: <Footer /> }}
      next={{ header: <V2Header />, footer: <V2Footer /> }}
    >
      {children}
    </FrameSwitch>
  );
}
