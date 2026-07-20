"use client";

const POSE_A_URL =
  "https://res.cloudinary.com/dii7xhao3/image/upload/v1784557583/IMG-20260719-WA0003_sahyyq.jpg";
const POSE_B_URL =
  "https://res.cloudinary.com/dii7xhao3/image/upload/v1784557666/IMG-20260720-WA0001_gdopcz.jpg";
const RESULT_VIDEO_URL =
  "https://res.cloudinary.com/dii7xhao3/video/upload/v1784557835/VID-20260720-WA0000_ofzoyp.mp4";

export default function Hero({ t, onCtaClick }) {
  return (
    <section className="pt-16 pb-20 px-6">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.hero.eyebrow}</p>

      <div className="flex justify-center mb-6">
        <span className="font-mono text-[10px] tracking-[0.1em] text-center border border-black rounded-full px-3 py-1.5 max-w-xs">
          {t.hero.badge}
        </span>
      </div>

      <h1 className="font-display text-4xl leading-[1.15] text-center mb-6">
        {t.hero.title}
        <br />
        <span className="italic">{t.hero.titleHighlight}</span>
      </h1>

      <p className="text-neutral-600 text-center leading-relaxed max-w-md mx-auto mb-10">
        {t.hero.subtitle}
      </p>

      <div className="flex justify-center mb-16">
        <button
          type="button"
          onClick={onCtaClick}
          className="rounded-full bg-black text-white text-sm font-medium px-7 py-3.5 hover:bg-neutral-800 transition-colors duration-200"
        >
          {t.hero.cta}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 max-w-sm mx-auto">
        <div className="flex-1 aspect-square border border-black rounded-md overflow-hidden">
          <img src={POSE_A_URL} alt="Pose A" className="w-full h-full object-cover" />
        </div>

        <div className="flex-1 aspect-square border border-dashed border-neutral-400 rounded-md flex items-center justify-center">
          <span className="font-mono text-xs text-neutral-400">?</span>
        </div>

        <div className="flex-1 aspect-square border border-black rounded-md overflow-hidden">
          <img src={POSE_B_URL} alt="Pose B" className="w-full h-full object-cover" />
        </div>

        <span className="mx-1 text-neutral-400">→</span>

        <div className="flex-1 aspect-square border border-black rounded-md overflow-hidden bg-black">
          <video
            src={RESULT_VIDEO_URL}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
