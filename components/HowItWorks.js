"use client";

export default function HowItWorks({ t }) {
  return (
    <section className="py-16 px-6 border-t border-black">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.howItWorks.eyebrow}</p>
      <h2 className="font-display text-2xl text-center mb-12">{t.howItWorks.title}</h2>

      <div className="space-y-10 max-w-sm mx-auto">
        {t.howItWorks.steps.map((step) => (
          <div key={step.number} className="border border-black rounded-lg p-5">
            <span className="font-mono text-xs text-neutral-400">{step.number}</span>
            <h3 className="font-medium mt-2 mb-1">{step.title}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
