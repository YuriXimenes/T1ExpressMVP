export const siteConfig = {
  name: "T1 Express",
  tagline: "Transporte especializado em TCG entre lojas parceiras.",
  description:
    "A T1 Express conecta lojas de TCG por todo o Brasil com envios rápidos, seguros e rastreáveis, feitos sob medida para cartas colecionáveis.",
  social: {
    facebook: "https://facebook.com",
    instagram: "https://instagram.com",
    twitter: "https://twitter.com",
    youtube: "https://youtube.com",
  },
} as const;

export interface NavItem {
  label: string;
  href: string;
}

export const mainNav: NavItem[] = [
  { label: "Como funciona", href: "/#como-funciona" },
  { label: "Pontos T1", href: "/pontos-t1" },
  { label: "Para lojas", href: "/para-lojas" },
  { label: "Segurança", href: "/seguranca" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Plataforma",
    items: [
      { label: "Como funciona", href: "/#como-funciona" },
      { label: "Pontos T1", href: "/pontos-t1" },
      { label: "Comparativo", href: "/comparativo" },
      { label: "Simular frete", href: "/simular-frete" },
    ],
  },
  {
    title: "Empresa",
    items: [
      { label: "Sobre a T1 Express", href: "/sobre" },
      { label: "Para lojas", href: "/para-lojas" },
      { label: "Segurança", href: "/seguranca" },
      { label: "Login", href: "/login" },
    ],
  },
];
