// Coche de confirmation : cercle plein, coche qui se trace (sans animation si prefers-reduced-motion).
export default function SuccessCheck({ size = 72, color = "var(--k-text)" }) {
  return (
    <svg
      className="k-success-check"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="k-success-check__circle" cx="48" cy="48" r="46" style={{ fill: color }} />
      <path className="k-success-check__mark" d="M28 49 L42 63 L69 35" pathLength="1" />
    </svg>
  );
}
