"use client";

export default function ProblemSection({ t }) {
  return (
    <section className="py-16 md:py-24 px-6 border-t border-black">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.problem.eyebrow}</p>
      <h2 className="font-display text-2xl md:text-4xl text-center mb-12 md:mb-16 max-w-sm md:max-w-2xl mx-auto">
        {t.problem.title}
      </h2>

      <div className="space-y-8 md:space-y-0 max-w-sm md:max-w-4xl mx-auto md:grid md:grid-cols-3 md:gap-10">
        {t.problem.points.map((point, i) => (
          <div key={i} className="flex gap-4 md:flex-col md:gap-2">
            <span className="font-mono text-xs text-neutral-400 pt-1">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3 className="font-medium mb-1">{point.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{point.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
