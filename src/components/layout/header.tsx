"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { Logo } from "@/components/shared/logo";
import { NavLink } from "@/components/layout/nav-link";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenuButton } from "@/components/layout/user-menu-button";
import { mainNav } from "@/lib/constants";
import { useAuth } from "@/lib/auth";

export function Header() {
  const { isLoggedIn, user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between">
        <Logo />

        <nav
          aria-label="Navegação principal"
          className="hidden items-center gap-8 lg:flex"
        >
          {mainNav.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {isLoggedIn && user ? (
            <UserMenuButton user={user} />
          ) : (
            <Button variant="ghost" asChild>
              <Link href="/login">Login</Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/simular-frete">Simular frete</Link>
          </Button>
        </div>

        <MobileNav />
      </Container>
    </header>
  );
}
