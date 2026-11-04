import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

/** Moldura do site público: cabeçalho, conteúdo e rodapé. O /admin não usa. */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </>
  );
}
