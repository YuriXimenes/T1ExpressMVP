import { SiteFrame } from "@/components/layout/site-frame";

// O grupo `(site)` não entra na URL; existe só para o /admin, que tem moldura
// própria, ficar sem o cabeçalho e o rodapé do site.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
