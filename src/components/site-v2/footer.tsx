import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/constants";
import { FacebookIcon, InstagramIcon, YoutubeIcon } from "@/components/shared/social-icons";
import { V2Container } from "@/components/site-v2/container";
import { PillLink } from "@/components/site-v2/pill";

/** Link de rede social de verdade (não só a página inicial da rede, como hoje no cadastro). */
export function isRealSocialUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "").length > 0;
  } catch {
    return false;
  }
}

const SOCIALS = [
  { label: "Instagram", href: siteConfig.social.instagram, icon: InstagramIcon },
  { label: "Facebook", href: siteConfig.social.facebook, icon: FacebookIcon },
  { label: "YouTube", href: siteConfig.social.youtube, icon: YoutubeIcon },
];

const COLUMNS = [
  {
    title: "Plataforma",
    items: [
      { label: "Como funciona", href: "/#como-funciona" },
      { label: "Simular frete", href: "/simular-frete" },
      { label: "Pontos T1", href: "/pontos-t1" },
      { label: "Rastrear pedido", href: "/conta" },
    ],
  },
  {
    title: "Empresa",
    items: [
      { label: "Sobre a T1", href: "/sobre" },
      { label: "Para lojas", href: "/para-lojas" },
      { label: "Indique uma loja", href: "/#indicar" },
      { label: "Segurança", href: "/seguranca" },
    ],
  },
];

const h4 = "mb-2.5 font-t1-display text-sm font-normal tracking-[0.16em] text-t1-ink uppercase";

export function V2Footer() {
  return (
    <footer className="mt-[clamp(64px,8vw,96px)] border-t border-t1-line bg-[linear-gradient(180deg,#fff,#f3f6fb)]">
      <V2Container>
        <div className="flex flex-col gap-5 border-b border-t1-line pt-11 pb-9 md:flex-row md:items-center md:justify-between">
          <p className="max-w-[780px] font-t1-display text-[clamp(30px,3.6vw,48px)] leading-[1.08] uppercase">
            Coleta na loja. Retirada perto de você. <span className="text-t1-accent">Cuidado em toda a rota.</span>
          </p>
          <PillLink href="/simular-frete" className="self-start md:self-auto">
            Simular frete <ArrowRight aria-hidden="true" />
          </PillLink>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-7 py-10 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <Image src="/brand/logo-light.svg" alt="T1 Express" width={623} height={502} className="h-[52px] w-auto" />
            <p className="mt-3.5 max-w-[320px] text-[13.5px] text-t1-muted">
              Transporte especializado em cartas colecionáveis entre lojas parceiras do Rio de Janeiro.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className={h4}>{col.title}</h2>
              <ul className="grid gap-0.5 text-sm text-t1-muted">
                {col.items.map((it) => (
                  <li key={it.label} className="flex min-h-10 items-center">
                    <Link href={it.href} className="hover:text-t1-accent">
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="col-span-2 sm:col-span-1">
            <h2 className={h4}>Contato</h2>
            <ul className="grid gap-0.5 text-sm text-t1-muted">
              <li className="flex min-h-10 items-center">
                <a href={`mailto:${siteConfig.contact.email}`} className="hover:text-t1-accent">
                  {siteConfig.contact.email}
                </a>
              </li>
              <li className="flex min-h-10 items-center">{siteConfig.contact.phone}</li>
              <li className="flex min-h-10 items-center">Rio de Janeiro · RJ</li>
            </ul>
          </div>

          <div>
            <h2 className={h4}>Redes</h2>
            <div className="flex gap-2.5">
              {SOCIALS.map(({ label, href, icon: Icon }) =>
                isRealSocialUrl(href) ? (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="grid size-12 place-items-center rounded-[14px] bg-white text-t1-muted shadow-[inset_0_0_0_1px_var(--t1-line),var(--t1-shadow-sm)] hover:text-t1-accent"
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </a>
                ) : (
                  <span
                    key={label}
                    role="img"
                    aria-label={`${label} (em breve)`}
                    title="Em breve"
                    className="grid size-12 place-items-center rounded-[14px] bg-white text-t1-muted opacity-55 shadow-[inset_0_0_0_1px_var(--t1-line)]"
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-t1-line py-6 text-[12.5px] text-t1-dim sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} T1 Express. Todos os direitos reservados.</span>
        </div>
      </V2Container>
    </footer>
  );
}
