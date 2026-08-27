export function PurchaseIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="82" y="20" width="76" height="150" rx="14" fill="var(--brand-800)" />
      <rect x="90" y="34" width="60" height="112" rx="4" fill="var(--brand-50)" />
      <rect x="102" y="150" width="36" height="6" rx="3" fill="var(--brand-300)" />
      <rect x="98" y="46" width="44" height="30" rx="4" fill="white" />
      <rect x="98" y="82" width="44" height="8" rx="3" fill="var(--brand-200)" />
      <rect x="98" y="96" width="30" height="8" rx="3" fill="var(--brand-200)" />
      <g transform="translate(146 106)">
        <circle r="26" fill="var(--sky-400)" />
        <path
          d="M-9 0 L-2 8 L11 -9"
          stroke="var(--brand-900)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
      <g transform="translate(56 60)">
        <rect x="-20" y="-14" width="40" height="28" rx="8" fill="white" />
        <circle cx="-8" cy="0" r="3" fill="var(--brand-400)" />
        <circle cx="2" cy="0" r="3" fill="var(--brand-400)" />
        <circle cx="12" cy="0" r="3" fill="var(--brand-400)" />
      </g>
    </svg>
  );
}
