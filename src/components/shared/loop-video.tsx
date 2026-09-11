"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function LoopVideo({
  src,
  className,
  blend,
}: {
  src: string;
  className?: string;
  blend?: "screen" | "multiply";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      video.pause();
      video.currentTime = 0;
    } else {
      video.play().catch(() => {
        // autoplay pode ser bloqueado pelo navegador; sem áudio, não é crítico.
      });
    }
  }, []);

  return (
    <video
      ref={videoRef}
      className={cn(
        "h-auto w-full object-contain",
        blend === "screen" && "mix-blend-screen",
        blend === "multiply" && "mix-blend-multiply",
        className,
      )}
      src={src}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      aria-hidden="true"
    />
  );
}
