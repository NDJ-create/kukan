"use client";

export default function Differentiator({ t }) {
  return (
    <section className="py-16 px-6 border-t border-black">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.differentiator.eyebrow}</p>
      <h2 className="font-display text-2xl text-center mb-12 max-w-sm mx-auto">
        {t.differentiator.title}
      </h2>

      <div className="max-w-sm mx-auto border border-black rounded-lg overflow-hidden">
        <div className="grid grid-cols-2">
          <div className="p-3 border-b border-r border-black text-center">
            <span className="font-mono text-[10px] text-neutral-500">{t.differentiator.themLabel}</span>
          </div>
          <div className="p-3 border-b border-black text-center bg-black">
            <span className="font-mono text-[10px] text-white">{t.differentiator.usLabel}</span>
          </div>
        </div>

        {t.differentiator.rows.map((row, i) => (
          <div key={i} className="grid grid-cols-2">
            <div
              className={[
                "p-3 border-r border-black text-sm text-neutral-500",
                i < t.differentiator.rows.length - 1 ? "border-b" : "",
              ].join(" ")}
            >
              {row.them}
            </div>
            <div
              className={[
                "p-3 text-sm font-medium",
                i < t.differentiator.rows.length - 1 ? "border-b border-black" : "",
              ].join(" ")}
            >
              {row.us}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
