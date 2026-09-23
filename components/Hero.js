"use client";

export default function Hero({ t, onCtaClick }) {
  return (
    <section className="pt-16 md:pt-24 pb-20 md:pb-28 px-6">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.hero.eyebrow}</p>

      <div className="flex justify-center mb-6">
        <span className="font-mono text-[10px] tracking-[0.1em] text-center border border-black rounded-md px-3 py-1.5 max-w-xs">
          {t.hero.badge}
        </span>
      </div>

      <h1 className="font-display text-4xl md:text-6xl leading-[1.2] text-center mb-6 max-w-4xl mx-auto">
        {t.hero.title}
        <br />
        <span>{t.hero.titleHighlight}</span>
      </h1>

      <p className="text-neutral-600 text-center leading-relaxed max-w-md md:max-w-xl mx-auto mb-10 md:text-lg">
        {t.hero.subtitle}
      </p>

      <div className="flex justify-center mb-16">
        <button
          type="button"
          onClick={onCtaClick}
          className="rounded-md bg-black text-white text-sm font-medium px-7 py-3.5 hover:bg-neutral-800 transition-colors duration-200"
        >
          {t.hero.cta}
        </button>
      </div>

      <div className="flex items-stretch justify-center gap-3 md:gap-5 max-w-md md:max-w-4xl mx-auto">
        <div className="flex-1 aspect-square border border-black rounded-md bg-neutral-50" />
        <div className="flex-1 aspect-square border border-dashed border-neutral-400 rounded-md flex items-center justify-center">
          <span className="font-mono text-xs text-neutral-400">+</span>
        </div>
        <div className="flex-1 aspect-square border border-black rounded-md bg-neutral-50" />
        <span className="hidden md:flex items-center mx-1 text-neutral-400">→</span>
        <div className="flex-1 aspect-square border border-black rounded-md bg-neutral-50" />
      </div>
    </section>
  );
}
