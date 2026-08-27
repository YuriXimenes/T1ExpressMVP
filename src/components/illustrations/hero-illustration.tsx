function Store({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-46" y="-6" width="92" height="60" rx="6" fill="var(--brand-50)" />
      <rect x="-46" y="-6" width="92" height="16" rx="6" fill="var(--brand-300)" />
      <rect x="-38" y="18" width="26" height="36" rx="2" fill="white" />
      <rect x="4" y="18" width="34" height="20" rx="2" fill="var(--brand-100)" />
      <polygon points="-52,-6 0,-34 52,-6" fill="var(--brand-700)" />
    </g>
  );
}

export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 380"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M100 300 C 180 260, 220 140, 400 90"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="3"
        strokeDasharray="2 14"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="translate(228 195) rotate(-18)">
        <rect x="-16" y="-16" width="32" height="32" rx="6" fill="var(--sky-400)" />
        <path d="M-16 -6 H16 M0 -16 V16" stroke="var(--brand-800)" strokeWidth="2" />
      </g>
      <g transform="translate(310 140) rotate(10)">
        <rect x="-13" y="-13" width="26" height="26" rx="5" fill="white" />
        <path d="M-13 -3 H13 M0 -13 V13" stroke="var(--brand-600)" strokeWidth="1.6" />
      </g>
      <g transform="translate(170 250) rotate(-6)">
        <rect x="-11" y="-11" width="22" height="22" rx="4" fill="var(--brand-300)" />
      </g>
      <Store x={100} y={300} />
      <Store x={400} y={90} />
    </svg>
  );
}
