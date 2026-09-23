"use client";

import PricingCards from "./PricingCards";

export default function PricingSection({ t, onChoosePlan }) {
  return (
    <section className="py-16 md:py-24 px-6 border-t border-black">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">NOS PLANS</p>
      <h2 className="font-display text-2xl md:text-4xl text-center mb-12 md:mb-16 max-w-sm md:max-w-2xl mx-auto">
        {t.dashboard.pricingSectionTitle}
      </h2>

      <PricingCards t={t.dashboard} onChoosePlan={onChoosePlan} currentPlanId={null} />
    </section>
  );
}
