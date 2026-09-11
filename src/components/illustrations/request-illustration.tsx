export function RequestIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="46" y="32" width="148" height="102" rx="8" fill="var(--brand-800)" />
      <rect x="54" y="40" width="132" height="86" rx="3" fill="var(--brand-50)" />
      <path d="M30 150 L60 134 H180 L210 150 Z" fill="var(--brand-900)" />

      <circle cx="64" cy="50" r="3" fill="var(--brand-300)" />
      <circle cx="74" cy="50" r="3" fill="var(--brand-300)" />
      <circle cx="84" cy="50" r="3" fill="var(--brand-300)" />

      <rect x="64" y="62" width="108" height="14" rx="4" fill="white" />
      <rect x="64" y="82" width="108" height="14" rx="4" fill="white" />

      <g className="animate-pulse-soft" style={{ transformOrigin: "94px 111px" }}>
        <rect x="64" y="102" width="60" height="18" rx="9" fill="var(--sky-400)" />
      </g>

      <g className="animate-float-y" style={{ transformOrigin: "196px 96px" }}>
        <circle cx="196" cy="96" r="16" fill="white" />
        <path
          d="M191 96 L195 100 L203 90"
          stroke="var(--brand-700)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
