import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  invert = false,
}: {
  className?: string;
  invert?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 text-lg font-bold",
        invert ? "text-white" : "text-slate-900",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-sm font-extrabold text-white",
          invert ? "bg-white/15" : "bg-brand-600",
        )}
        aria-hidden="true"
      >
        T1
      </span>
      <span className="font-heading">T1 Express</span>
    </Link>
  );
}
