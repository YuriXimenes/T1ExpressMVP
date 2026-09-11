"use client";

import { useState } from "react";
import { Info } from "lucide-react";

export function InfoTooltip({
  label = "Mais informações",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onTouchStart={() => setOpen(true)}
        onTouchEnd={() => setOpen(false)}
        className="text-slate-400 hover:text-slate-600 focus-visible:outline-none"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-10 mb-1.5 w-48 max-w-[80vw] rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs text-white shadow-lg"
        >
          {children}
          <span className="absolute top-full left-2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 bg-slate-900" />
        </span>
      )}
    </span>
  );
}
