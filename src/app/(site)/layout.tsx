import { SiteFrame } from "@/components/layout/site-frame";
import { IS_STAGING } from "@/lib/app-env";
import { getSiteV2Areas } from "@/lib/site-v2/server";

// O grupo `(site)` não entra na URL; existe só para o /admin, que tem moldura
// própria, ficar sem o cabeçalho e o rodapé do site.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteFrame v2Areas={getSiteV2Areas()} isStaging={IS_STAGING}>
      {children}
    </SiteFrame>
  );
}
