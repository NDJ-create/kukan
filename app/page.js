"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import Hero from "@/components/Hero";
import ProblemSection from "@/components/ProblemSection";
import HowItWorks from "@/components/HowItWorks";
import Differentiator from "@/components/Differentiator";
import FAQ from "@/components/FAQ";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";
import { translations } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

export default function Home() {
  const [lang, setLang] = useLanguage();
  const router = useRouter();
  const t = translations[lang];

  const goToSignup = () => {
    router.push("/signup");
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-30 bg-white flex items-center justify-between px-6 border-b border-black h-[72px]">
        <span className="h-10 flex items-center gap-2 font-display text-2xl tracking-tight">
          <Image src="/kukan-icon.png" alt="Kukan" width={40} height={40} className="rounded-md" />
          Kukan
        </span>

        <div className="h-10 flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-mono text-xs uppercase tracking-widest text-neutral-600 hover:text-black transition-colors translate-y-[5px]"
          >
            {t.auth.loginButton}
          </button>

          <div className="flex items-center rounded-md border border-black p-0.5 font-mono text-xs">
            {["fr", "en"].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={[
                  "px-3 py-1 rounded-md uppercase tracking-widest transition-colors duration-200",
                  lang === code ? "bg-black text-white" : "text-neutral-500",
                ].join(" ")}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </header>

      <Hero t={t} onCtaClick={goToSignup} />
      <ProblemSection t={t} />
      <HowItWorks t={t} />
      <Differentiator t={t} />
      <FAQ t={t} />
      <PricingSection t={t} onChoosePlan={goToSignup} />
      <Footer t={t} />
    </main>
  );
}
