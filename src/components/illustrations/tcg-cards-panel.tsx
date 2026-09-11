import type { ReactNode } from "react";
import { Gem, Shield, Sparkles } from "lucide-react";
import { Logo } from "@/components/shared/logo";

function CardFace({
  icon,
  rotate,
  offsetX,
  accent,
  delay,
}: {
  icon: ReactNode;
  rotate: number;
  offsetX: number;
  accent: string;
  delay: number;
}) {
  return (
    <div
      className="[grid-area:1/1]"
      style={{ transform: `translateX(${offsetX}px) rotate(${rotate}deg)` }}
    >
      <div
        className="animate-float-y flex h-44 w-32 flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 shadow-2xl backdrop-blur-sm"
        style={{ animationDelay: `${delay}s` }}
      >
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${accent} text-white`}
        >
          {icon}
        </span>
        <span className="block h-1.5 w-3/4 rounded-full bg-white/25" />
        <span className="block h-1.5 w-1/2 rounded-full bg-white/25" />
        <span className="mt-auto block h-1.5 w-2/3 rounded-full bg-white/15" />
      </div>
    </div>
  );
}

export function TcgCardsPanel({ className }: { className?: string }) {
  return (
    <div
      className={`from-brand-700 via-brand-800 to-brand-950 relative flex-col justify-between overflow-hidden bg-gradient-to-br p-6 ${className ?? ""}`}
    >
      <div
        aria-hidden="true"
        className="bg-brand-400/30 pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -bottom-16 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl"
      />

      <p className="relative text-sm font-medium text-white/70">
        Feito para colecionadores de TCG
      </p>

      <div className="relative grid flex-1 place-items-center">
        <CardFace
          icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
          rotate={-14}
          offsetX={-38}
          accent="bg-brand-500"
          delay={0}
        />
        <CardFace
          icon={<Gem className="h-4 w-4" aria-hidden="true" />}
          rotate={12}
          offsetX={38}
          accent="bg-sky-400"
          delay={0.5}
        />
        <CardFace
          icon={<Shield className="h-4 w-4" aria-hidden="true" />}
          rotate={0}
          offsetX={0}
          accent="bg-white/20"
          delay={1}
        />
      </div>

      <Logo invert className="relative" />
    </div>
  );
}
