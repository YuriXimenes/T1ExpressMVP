"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, LogOut } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/initials";

const ITEM =
  "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900";

/** Menu do usuário na barra superior: única saída do backoffice para o site. */
export function AdminUserMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  if (!user) return null;

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm text-slate-700 hover:bg-slate-100 data-[state=open]:bg-slate-100">
        <Avatar size="sm">
          <AvatarImage src={user.avatarUrl} alt="" />
          <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate font-medium sm:block">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <span className="sr-only">Menu da conta</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item asChild className={ITEM}>
            <Link href="/">
              <ExternalLink className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Voltar ao site
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={() => void handleLogout()}>
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Sair da conta
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
