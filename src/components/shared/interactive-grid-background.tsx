"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const SPACING = 32;
const DOT_RADIUS = 1.3;
const PROXIMITY_RADIUS = 180;
const BASE_OPACITY = 0.12;
const PEAK_OPACITY = 0.85;
const EASE = 0.12;
const DOT_COLOR = "37, 99, 235"; // brand-600

interface Dot {
  x: number;
  y: number;
  opacity: number;
}

/**
 * Réplica em CSS puro do grid estático desenhado no canvas — fica visível já na
 * primeira pintura (antes do JS hidratar), evitando um flash sem pontos nessa
 * janela. O canvas assume por cima assim que hidrata, adicionando o brilho
 * interativo de proximidade do mouse.
 */
const staticGridStyle = {
  backgroundImage: `radial-gradient(circle, rgba(${DOT_COLOR}, ${BASE_OPACITY}) ${DOT_RADIUS}px, transparent ${DOT_RADIUS}px)`,
  backgroundSize: `${SPACING}px ${SPACING}px`,
  backgroundPosition: `${SPACING / 2}px ${SPACING / 2}px`,
};

export function InteractiveGridBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx = ctx2d;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let pointer: { x: number; y: number } | null = null;
    let frameId = 0;

    function buildGrid() {
      dots = [];
      for (let x = SPACING / 2; x < width; x += SPACING) {
        for (let y = SPACING / 2; y < height; y += SPACING) {
          dots.push({ x, y, opacity: BASE_OPACITY });
        }
      }
    }

    function resize() {
      if (!canvas || !container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    }

    function drawStatic() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = `rgba(${DOT_COLOR}, ${BASE_OPACITY})`;
      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        let target = BASE_OPACITY;
        if (pointer) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < PROXIMITY_RADIUS) {
            const falloff = 1 - dist / PROXIMITY_RADIUS;
            target = BASE_OPACITY + (PEAK_OPACITY - BASE_OPACITY) * falloff;
          }
        }
        dot.opacity += (target - dot.opacity) * EASE;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${DOT_COLOR}, ${dot.opacity})`;
        ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      frameId = requestAnimationFrame(tick);
    }

    function handlePointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function handlePointerLeave() {
      pointer = null;
    }

    resize();
    // Desenha o grid estático de imediato para já cobrir a seção na primeira
    // pintura (o loop animado assume a partir do primeiro requestAnimationFrame).
    drawStatic();

    if (!prefersReducedMotion) {
      frameId = requestAnimationFrame(tick);
      container.addEventListener("pointermove", handlePointerMove);
      container.addEventListener("pointerleave", handlePointerLeave);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (prefersReducedMotion) drawStatic();
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", className)}
        style={staticGridStyle}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0", className)}
      />
    </>
  );
}
