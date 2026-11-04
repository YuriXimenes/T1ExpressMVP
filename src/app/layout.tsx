import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { CatalogProvider } from "@/lib/catalog/provider";
import { getCatalog } from "@/lib/catalog/server";
import { siteConfig } from "@/lib/constants";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const catalog = await getCatalog();

  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Cabeçalho e rodapé ficam em (site)/layout.tsx: o /admin tem moldura própria. */}
        <CatalogProvider catalog={catalog}>{children}</CatalogProvider>
      </body>
    </html>
  );
}
