import type { ReactNode } from "react";
import { Fingerprint, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/shared/logo";

function SatelliteBadge({
  icon,
  offsetX,
  offsetY,
  delay,
}: {
  icon: ReactNode;
  offsetX: number;
  offsetY: number;
  delay: number;
}) {
  return (
    <div
      className="[grid-area:1/1]"
      style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
    >
      <div
        className="animate-float-y flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-xl backdrop-blur-sm"
        style={{ animationDelay: `${delay}s` }}
      >
        {icon}
      </div>
    </div>
  );
}

export function LoginAccessPanel({ className }: { className?: string }) {
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
        Acesso seguro à sua conta
      </p>

      <div className="relative grid flex-1 place-items-center">
        <SatelliteBadge
          icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
          offsetX={56}
          offsetY={-60}
          delay={0}
        />
        <SatelliteBadge
          icon={<Fingerprint className="h-6 w-6" aria-hidden="true" />}
          offsetX={-58}
          offsetY={56}
          delay={0.6}
        />

        <div className="[grid-area:1/1]">
          <div
            className="animate-float-y flex h-44 w-36 flex-col items-center justify-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-sm"
            style={{ animationDelay: "0.3s" }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="block h-1.5 w-4/5 rounded-full bg-white/25" />
            <span className="block h-1.5 w-3/5 rounded-full bg-white/15" />
          </div>
        </div>
      </div>

      <Logo invert className="relative" />
    </div>
  );
}
