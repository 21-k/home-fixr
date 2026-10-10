/**
 * The Home Fixr mark: an HF monogram (the H's crossbar runs through as the F's
 * middle arm), white on the brand blue. Same drawing as src/app/icon.svg.
 * Size it with a Tailwind size class, e.g. <LogoMark className="size-7" />.
 */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" className="fill-brand-500" />
      <g fill="#fff">
        <rect x="15" y="12" width="5" height="40" rx="2.5" />
        <rect x="31" y="12" width="5" height="12.5" rx="2.5" />
        <rect x="31" y="12" width="19" height="5" rx="2.5" />
        <rect x="15" y="27.5" width="30" height="5" rx="2.5" />
        <rect x="31" y="35.5" width="5" height="16.5" rx="2.5" />
      </g>
    </svg>
  );
}
