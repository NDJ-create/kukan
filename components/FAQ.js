"use client";

import { useState } from "react";

export default function FAQ({ t }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section className="py-16 md:py-24 px-6 border-t border-black">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.faq.eyebrow}</p>
      <h2 className="font-display text-2xl md:text-4xl text-center mb-12 md:mb-16 max-w-sm md:max-w-2xl mx-auto">
        {t.faq.title}
      </h2>

      <div className="max-w-sm md:max-w-2xl mx-auto flex flex-col gap-2">
        {t.faq.items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="border border-black rounded-md overflow-hidden">
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 md:py-4 text-left"
              >
                <span className="text-sm md:text-base font-medium pr-4">{item.q}</span>
                <span className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}>
                  +
                </span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 text-sm text-neutral-600 leading-relaxed">
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
