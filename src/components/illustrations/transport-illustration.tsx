export function TransportIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 158 H230"
        stroke="var(--brand-100)"
        strokeWidth="3"
        strokeDasharray="1 10"
        strokeLinecap="round"
      />

      <rect x="30" y="86" width="100" height="60" rx="8" fill="var(--brand-700)" />
      <rect x="130" y="106" width="46" height="40" rx="6" fill="var(--brand-800)" />
      <rect x="138" y="112" width="22" height="16" rx="2" fill="var(--brand-100)" />

      <rect x="46" y="98" width="30" height="26" rx="3" fill="white" />
      <text
        x="61"
        y="116"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--brand-700)"
      >
        T1
      </text>
      <rect x="82" y="98" width="30" height="26" rx="3" fill="var(--sky-400)" />

      <circle cx="66" cy="152" r="14" fill="var(--brand-900)" />
      <circle cx="66" cy="152" r="6" fill="var(--brand-100)" />
      <circle cx="152" cy="152" r="14" fill="var(--brand-900)" />
      <circle cx="152" cy="152" r="6" fill="var(--brand-100)" />

      <g transform="translate(200 60) rotate(12)">
        <rect x="-11" y="-11" width="22" height="22" rx="4" fill="var(--brand-300)" />
      </g>
    </svg>
  );
}
