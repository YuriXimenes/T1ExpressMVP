import Image from "next/image";
import { cn } from "@/lib/utils";
import type { StoreLogo } from "@/lib/types/store-logo";

export function LogoMarquee({ logos }: { logos: StoreLogo[] }) {
  const track = [...logos, ...logos];

  return (
    <div
      className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
      role="group"
      aria-label="Lojas parceiras"
    >
      <div className="animate-marquee flex w-max items-center gap-20 hover:[animation-play-state:paused] sm:gap-24">
        {track.map((logo, index) => (
          <div
            key={`${logo.name}-${index}`}
            className={cn(
              "flex h-16 shrink-0 items-center justify-center",
              logo.onDark && "rounded-lg bg-slate-900 px-5 py-3",
            )}
            aria-hidden={index >= logos.length}
          >
            {logo.textOnly ? (
              <span className="px-1 text-base font-semibold whitespace-nowrap text-white">
                {logo.name}
              </span>
            ) : (
              <Image
                src={logo.src}
                alt={logo.name}
                width={160}
                height={64}
                className="h-full w-auto object-contain"
                loading="lazy"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
