import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/initials";
import type { MockUser } from "@/lib/auth";

export function UserMenuButton({
  user,
  className,
}: {
  user: MockUser;
  className?: string;
}) {
  return (
    <Link
      href="/conta"
      className={cn(
        "flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50",
        className,
      )}
    >
      <Avatar size="sm">
        <AvatarImage src={user.avatarUrl} alt="" />
        <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
      </Avatar>
      {user.name}
    </Link>
  );
}
