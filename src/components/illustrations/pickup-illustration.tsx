export function PickupIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="40" y="70" width="130" height="80" rx="6" fill="var(--brand-50)" />
      <rect x="40" y="70" width="130" height="20" rx="6" fill="var(--brand-300)" />
      <rect x="122" y="98" width="34" height="52" rx="2" fill="white" />
      <rect x="58" y="106" width="46" height="30" rx="3" fill="var(--brand-100)" />

      <g transform="translate(190 118)">
        <circle r="20" cy="-42" fill="var(--brand-800)" />
        <rect x="-16" y="-26" width="32" height="50" rx="12" fill="var(--brand-700)" />
        <rect
          x="-24"
          y="-6"
          width="18"
          height="40"
          rx="8"
          fill="var(--brand-800)"
          transform="rotate(-18 -15 14)"
        />
      </g>

      <g
        className="animate-float-y"
        style={{ transformOrigin: "150px 78px" }}
        transform="translate(150 78)"
      >
        <rect x="-16" y="-16" width="32" height="32" rx="5" fill="var(--sky-400)" />
        <path d="M-16 -6 H16 M0 -16 V16" stroke="var(--brand-900)" strokeWidth="2" />
      </g>
    </svg>
  );
}
