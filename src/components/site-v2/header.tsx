"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calculator,
  LogIn,
  LogOut,
  Map,
  MapPin,
  Menu,
  Package,
  Route,
  Settings,
  ShieldCheck,
  Store,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/initials";
import { useAuth } from "@/lib/auth";
import { V2Container } from "@/components/site-v2/container";
import { PillLink } from "@/components/site-v2/pill";

// Menu principal do layout novo (mesma ordem do protótipo híbrido).
export const V2_NAV = [
  { href: "/#como-funciona", label: "Como funciona", icon: Route },
  { href: "/sobre", label: "Sobre nós", icon: Map },
  { href: "/pontos-t1", label: "Pontos T1", icon: MapPin },
  { href: "/para-lojas", label: "Para lojas", icon: Store },
  { href: "/seguranca", label: "Segurança", icon: ShieldCheck },
] as const;

const AUTH_PAGES = ["/login", "/criar-conta", "/esqueci-senha", "/redefinir-senha"];

/** Endereço de login que volta para a página atual depois de entrar. */
export function loginHref(pathname: string): string {
  if (pathname === "/" || AUTH_PAGES.some((p) => pathname.startsWith(p))) return "/login";
  return `/login?next=${encodeURIComponent(pathname)}`;
}

type PanelMode = "closed" | "menu" | "account";

export function V2Header() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { isLoggedIn, isReady, user, logout } = useAuth();
  const [panel, setPanel] = useState<PanelMode>("closed");
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Fecha o painel ao trocar de página (ajuste de estado durante a renderização).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setPanel("closed");
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (panel === "closed") return;
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setPanel("closed");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel("closed");
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  const logged = isReady && isLoggedIn && !!user;
  const isCurrent = (href: string) => !href.includes("#") && pathname === href;

  function toggle(mode: Exclude<PanelMode, "closed">) {
    setPanel((p) => (p === mode ? "closed" : mode));
  }

  function openAccount() {
    // No PC o avatar abre só o menu da conta; no celular, o menu completo.
    const wide = window.matchMedia("(min-width: 1181px)").matches;
    toggle(wide ? "account" : "menu");
  }

  async function onLogout() {
    setPanel("closed");
    await logout();
    router.push("/");
  }

  const itemCls =
    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[15px] font-medium text-t1-ink hover:bg-t1-hover [&_svg]:size-[18px] [&_svg]:text-t1-brand";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background,box-shadow,backdrop-filter] duration-200",
        scrolled &&
          "bg-white/85 shadow-[0_1px_0_var(--t1-line),0_10px_30px_-20px_rgba(15,23,42,.25)] backdrop-blur-[14px] backdrop-saturate-[1.4]",
      )}
    >
      <V2Container>
        <div ref={navRef} className="relative flex h-[72px] items-center justify-between gap-4 lg:h-[78px]">
          <Link href="/" aria-label="T1 Express, início" className="shrink-0">
            <Image
              src="/brand/logo-light.svg"
              alt="T1 Express"
              width={623}
              height={502}
              priority
              className="h-[38px] w-auto min-[1181px]:h-[42px]"
            />
          </Link>

          <nav
            aria-label="Principal"
            className="hidden gap-[clamp(20px,2.6vw,38px)] text-[13.5px] font-semibold text-t1-muted min-[1181px]:flex"
          >
            {V2_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isCurrent(n.href) ? "page" : undefined}
                className="relative py-2 hover:text-t1-ink aria-[current=page]:text-t1-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:bottom-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:rounded-sm aria-[current=page]:after:bg-t1-brand"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2.5">
            {!isReady ? (
              <span className="h-11 w-[150px]" aria-hidden="true" />
            ) : logged ? (
              <>
                <PillLink href="/simular-frete" size="sm" className="hidden min-[561px]:inline-flex">
                  Simular frete
                </PillLink>
                <button
                  type="button"
                  onClick={openAccount}
                  aria-haspopup="true"
                  aria-expanded={panel !== "closed"}
                  aria-controls="v2-menu-panel"
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-full bg-white px-1.5 text-[13.5px] font-semibold text-t1-ink shadow-[inset_0_0_0_1px_var(--t1-line-2),var(--t1-shadow-sm)] hover:bg-t1-card-3 min-[561px]:pr-4"
                >
                  <Avatar name={user.name} url={user.avatarUrl} />
                  <span className="hidden min-[561px]:inline">Minha conta</span>
                  <span className="sr-only">: abrir menu da conta de {user.name}</span>
                </button>
              </>
            ) : (
              <>
                <PillLink href={loginHref(pathname)} variant="ghost" size="sm" className="hidden min-[561px]:inline-flex">
                  Entrar
                </PillLink>
                <PillLink href="/simular-frete" size="sm">
                  Simular frete
                </PillLink>
              </>
            )}
            <button
              type="button"
              onClick={() => toggle("menu")}
              aria-label={panel === "menu" ? "Fechar menu" : "Abrir menu"}
              aria-expanded={panel === "menu"}
              aria-controls="v2-menu-panel"
              className="grid size-12 place-items-center rounded-full bg-white text-t1-ink shadow-[inset_0_0_0_1px_var(--t1-line-2),var(--t1-shadow-sm)] min-[1181px]:hidden"
            >
              {panel === "menu" ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>
          </div>

          {panel !== "closed" && (
            <div
              id="v2-menu-panel"
              className={cn(
                "absolute top-[calc(100%-4px)] right-0 w-[min(340px,100%)] rounded-[20px] bg-white p-2.5 shadow-[inset_0_0_0_1px_var(--t1-line),0_30px_60px_-20px_rgba(15,23,42,.3)]",
                panel === "menu" && "min-[1181px]:hidden",
              )}
            >
              {logged && (
                <>
                  <div className="flex items-center gap-3 px-3.5 pt-2.5 pb-3">
                    <Avatar name={user.name} url={user.avatarUrl} />
                    <div className="min-w-0">
                      <b className="block truncate text-sm">{user.name}</b>
                      <span className="block truncate text-xs text-t1-muted">{user.email}</span>
                    </div>
                  </div>
                  <Link href="/conta" className={itemCls}>
                    <Package aria-hidden="true" />
                    Meus pedidos
                  </Link>
                  <Link href="/conta#credito" className={itemCls}>
                    <Wallet aria-hidden="true" />
                    Crédito
                  </Link>
                  <Link href="/conta#configuracoes" className={itemCls}>
                    <Settings aria-hidden="true" />
                    Configurações
                  </Link>
                  <hr className="mx-1.5 my-2 border-t1-line" />
                </>
              )}
              {panel === "menu" && (
                <>
                  {V2_NAV.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={isCurrent(n.href) ? "page" : undefined}
                      className={cn(itemCls, "aria-[current=page]:bg-t1-brand-50 aria-[current=page]:text-t1-brand-800")}
                    >
                      <n.icon aria-hidden="true" />
                      {n.label}
                    </Link>
                  ))}
                  <Link href="/simular-frete" className={itemCls}>
                    <Calculator aria-hidden="true" />
                    Simular frete
                  </Link>
                  <hr className="mx-1.5 my-2 border-t1-line" />
                </>
              )}
              {logged ? (
                <button type="button" onClick={onLogout} className={itemCls}>
                  <LogOut aria-hidden="true" />
                  Sair
                </button>
              ) : (
                <>
                  <Link href={loginHref(pathname)} className={itemCls}>
                    <LogIn aria-hidden="true" />
                    Entrar
                  </Link>
                  <Link href="/criar-conta" className={itemCls}>
                    <UserPlus aria-hidden="true" />
                    Criar conta
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </V2Container>
    </header>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto do Storage ou data URL (tamanho fixo)
      <img
        src={url}
        alt=""
        className="size-[34px] shrink-0 rounded-full object-cover shadow-[0_0_0_2px_#fff,0_0_0_3px_var(--t1-accent-line)]"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#1d4ed8,#3b82f6)] text-xs font-bold tracking-[0.02em] text-white shadow-[0_0_0_2px_#fff,0_0_0_3px_var(--t1-accent-line)]"
    >
      {initials(name)}
    </span>
  );
}
