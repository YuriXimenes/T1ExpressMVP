import Link from "next/link";
import { Container } from "@/components/shared/container";
import { Logo } from "@/components/shared/logo";
import {
  FacebookIcon,
  InstagramIcon,
  XIcon,
  YoutubeIcon,
} from "@/components/shared/social-icons";
import { footerNav, siteConfig } from "@/lib/constants";

const socialLinks = [
  { label: "Facebook", href: siteConfig.social.facebook, icon: FacebookIcon },
  { label: "Instagram", href: siteConfig.social.instagram, icon: InstagramIcon },
  { label: "X (Twitter)", href: siteConfig.social.twitter, icon: XIcon },
  { label: "YouTube", href: siteConfig.social.youtube, icon: YoutubeIcon },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-white">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-slate-600">{siteConfig.tagline}</p>
          <div className="mt-6 flex items-center gap-3">
            {socialLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="hover:bg-brand-50 hover:text-brand-600 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        {footerNav.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
            <ul className="mt-4 space-y-3">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:text-brand-600 text-sm text-slate-600 transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Contato</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            <li>contato@t1express.com.br</li>
            <li>0800 123 4567</li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-slate-100 py-6">
        <Container>
          <p className="text-center text-xs text-slate-400">
            © {new Date().getFullYear()} T1 Express. Todos os direitos reservados.
          </p>
        </Container>
      </div>
    </footer>
  );
}
