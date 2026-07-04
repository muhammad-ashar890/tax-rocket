/**
 * TaxRocketLogo — the official brand mark, used in the site header and
 * the wizard header. Exact SVG markup as supplied by the product team —
 * do not alter the path data or colors.
 */
export function TaxRocketLogo({
  showWordmark = true,
}: {
  showWordmark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
        aria-hidden="true"
      >
        <svg viewBox="0 0 36 36" className="h-6 w-6" fill="none">
          <path
            d="M10 11.5h12.5c3 0 5.5 2.5 5.5 5.5s-2.5 5.5-5.5 5.5H10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M10 11.5v13"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M10 24.5l9-6.5-9-6.5"
            stroke="#B8872F"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <span className="hidden text-lg font-extrabold tracking-tight text-foreground sm:inline-block">
          Tax<span className="text-primary">Rocket</span>
        </span>
      )}
    </span>
  );
}
