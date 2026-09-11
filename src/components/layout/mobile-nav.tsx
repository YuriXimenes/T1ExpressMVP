"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserMenuButton } from "@/components/layout/user-menu-button";
import { mainNav } from "@/lib/constants";
import { useAuth } from "@/lib/auth";

export function MobileNav() {
  const { isLoggedIn, user } = useAuth();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Navegação principal" className="flex flex-col gap-1 px-4">
          {mainNav.map((item) => (
            <SheetClose key={item.href} asChild>
              <Link
                href={item.href}
                className="rounded-md px-3 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 p-4">
          <SheetClose asChild>
            {isLoggedIn && user ? (
              <UserMenuButton user={user} className="justify-center py-2.5" />
            ) : (
              <Button variant="outline" size="lg" asChild>
                <Link href="/login">Login</Link>
              </Button>
            )}
          </SheetClose>
          <SheetClose asChild>
            <Button size="lg" asChild>
              <Link href="/simular-frete">Simular frete</Link>
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
