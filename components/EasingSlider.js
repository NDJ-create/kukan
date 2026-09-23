export default function EasingSlider({ curve, onChange, t }) {
  const exponent = Math.pow(10, -curve);
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const tLinear = i / 20;
    const tCurved = Math.pow(tLinear, exponent);
    points.push(`${tLinear * 60},${60 - tCurved * 60}`);
  }
  const pathD = "M " + points.join(" L ");

  return (
    <div className="flex flex-col gap-2 mb-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--k-text-secondary)]">{t.easing}</span>
        <svg width="60" height="60" viewBox="0 0 60 60" className="border border-[var(--k-border-strong)] rounded bg-[var(--k-document)]">
          <path d={pathD} fill="none" stroke="var(--k-text)" strokeWidth="1.5" />
        </svg>
      </div>

      <input
        type="range"
        min="-1"
        max="1"
        step="0.05"
        value={curve}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "var(--k-text-secondary)" }}
      />

      <div className="flex justify-between font-mono text-[9px] text-[var(--k-text-secondary)]">
        <span>{t.easeIn}</span>
        <span>{t.linear}</span>
        <span>{t.easeOut}</span>
      </div>
    </div>
  );
}
