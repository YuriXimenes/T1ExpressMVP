import Link from "next/link";

export function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={
        className ??
        "hover:text-brand-600 text-sm font-medium text-slate-700 transition-colors"
      }
    >
      {children}
    </Link>
  );
}
