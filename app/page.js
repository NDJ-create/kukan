"use client";

import { useEffect, useState } from "react";
import Hero from "@/components/Hero";
import ProblemSection from "@/components/ProblemSection";
import HowItWorks from "@/components/HowItWorks";
import Differentiator from "@/components/Differentiator";
import WaitlistForm from "@/components/WaitlistForm";
import Footer from "@/components/Footer";
import { translations } from "@/lib/i18n";

export default function Home() {
  const [lang, setLang] = useState("fr");

  useEffect(() => {
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang === "en") setLang("en");
  }, []);

  const t = translations[lang];

  const scrollToWaitlist = () => {
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="flex items-center justify-between px-6 py-5 border-b border-black">
        <span className="font-display text-2xl italic tracking-tight">Kukan</span>

        <div className="flex items-center rounded-full border border-black p-0.5 font-mono text-xs">
          {["fr", "en"].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              className={[
                "px-3 py-1 rounded-full uppercase tracking-widest transition-colors duration-200",
                lang === code ? "bg-black text-white" : "text-neutral-500",
              ].join(" ")}
            >
              {code}
            </button>
          ))}
        </div>
      </header>

      <Hero t={t} onCtaClick={scrollToWaitlist} />
      <ProblemSection t={t} />
      <HowItWorks t={t} />
      <Differentiator t={t} />
      <WaitlistForm t={t} />
      <Footer t={t} />
    </main>
  );
}
