import Image from "next/image";
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
      className={cn("inline-flex items-center", className)}
      aria-label="T1 Express"
    >
      <Image
        src={invert ? "/brand/logo-on-blue.svg" : "/brand/logo-light.svg"}
        alt="T1 Express"
        width={623}
        height={502}
        priority
        className="h-11 w-auto"
      />
    </Link>
  );
}
