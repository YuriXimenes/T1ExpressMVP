"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function FloatParallax({
  children,
  className,
  floatClassName = "animate-float-slow",
  intensity = 24,
}: {
  children: React.ReactNode;
  className?: string;
  floatClassName?: string;
  intensity?: number;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const parallaxEl = parallaxRef.current;
    if (!wrapper || !parallaxEl) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    let ticking = false;
    let active = false;

    const applyParallax = () => {
      ticking = false;
      if (!active) return;
      const rect = wrapper.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      const distance = (elementCenter - viewportCenter) / viewportCenter;
      const clamped = Math.max(-1, Math.min(1, distance));
      parallaxEl.style.transform = `translateY(${clamped * intensity}px)`;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(applyParallax);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        if (active) {
          window.addEventListener("scroll", onScroll, { passive: true });
          applyParallax();
        } else {
          window.removeEventListener("scroll", onScroll);
        }
      },
      { threshold: 0, rootMargin: "10% 0px" },
    );

    observer.observe(wrapper);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [intensity]);

  return (
    <div ref={wrapperRef} className={className}>
      <div ref={parallaxRef}>
        <div className={cn(floatClassName)}>{children}</div>
      </div>
    </div>
  );
}
