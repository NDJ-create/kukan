"use client";

import { useState } from "react";

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-300">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export default function PricingCards({ t, onChoosePlan, currentPlanId }) {
  const [annual, setAnnual] = useState(false);

  const formatPrice = (cents) => (cents / 100).toFixed(2);

  const PlanCard = ({ id, name, priceMonthly, priceAnnual, generations, intermediates, hiddenStrokes, draw, frameExport, support, isEnterprise }) => (
    <div className="border border-black rounded-md p-6 flex flex-col">
      <h3 className="font-display text-xl mb-1">{name}</h3>

      {isEnterprise ? (
        <div className="mb-6">
          <span className="text-2xl font-medium">{t.customVolume}</span>
        </div>
      ) : (
        <div className="mb-6">
          <span className="text-3xl font-medium">${formatPrice(annual ? priceAnnual / 12 : priceMonthly)}</span>
          <span className="text-neutral-500 text-sm">{t.perMonth}</span>
          {annual && (
            <div className="font-mono text-[10px] text-neutral-500 mt-1">
              ${formatPrice(priceAnnual)} {t.billedAnnually}
            </div>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2.5 mb-6 text-sm flex-1">
        <li className="flex items-center gap-2">
          <Check /> {isEnterprise ? t.customVolume : `${generations} ${t.generationsPerMonth}`}
        </li>
        <li className="flex items-center gap-2">
          <Check /> {intermediates} {t.maxIntermediatesLabel}
        </li>
        <li className="flex items-center gap-2">
          {hiddenStrokes ? <Check /> : <Cross />} {t.featureHiddenStrokes}
        </li>
        <li className="flex items-center gap-2">
          {draw ? <Check /> : <Cross />} {t.featureDraw}
        </li>
        <li className="flex items-center gap-2">
          {frameExport ? <Check /> : <Cross />} {t.featureFrameExport}
        </li>
        <li className="flex items-center gap-2">
          <Check /> {t.featureSupport}: {support}
        </li>
      </ul>

      {currentPlanId === id ? (
        <button disabled className="w-full py-3 rounded-md border border-black font-mono text-xs uppercase tracking-widest opacity-50 cursor-not-allowed">
          {t.currentPlan}
        </button>
      ) : isEnterprise ? (
        <a
          href="mailto:contact@kukan.pro"
          className="w-full py-3 rounded-md border border-black text-center font-mono text-xs uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
        >
          {t.contactSales}
        </a>
      ) : (
        <button
          onClick={() => onChoosePlan(id)}
          className="w-full py-3 rounded-md bg-black text-white font-mono text-xs uppercase tracking-widest hover:bg-neutral-800 transition-colors"
        >
          {t.choosePlan}
        </button>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-10">
        <div className="flex items-center rounded-md border border-black p-0.5 font-mono text-xs">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-1.5 rounded-md transition-colors ${!annual ? "bg-black text-white" : "text-neutral-500"}`}
          >
            {t.monthly}
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-1.5 rounded-md transition-colors ${annual ? "bg-black text-white" : "text-neutral-500"}`}
          >
            {t.annual}
          </button>
        </div>
        {annual && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600 border border-black rounded-md px-2 py-1">
            {t.annualSave}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        <PlanCard
          id="independent"
          name="Independent"
          priceMonthly={1999}
          priceAnnual={17999}
          generations={55}
          intermediates={15}
          hiddenStrokes={true}
          draw={true}
          frameExport={false}
          support={t.supportEmail}
        />
        <PlanCard
          id="studio"
          name="Studio"
          priceMonthly={7999}
          priceAnnual={71999}
          generations={230}
          intermediates={30}
          hiddenStrokes={true}
          draw={true}
          frameExport={true}
          support={t.supportPriority}
        />
        <PlanCard
          id="enterprise"
          name="Enterprise"
          generations={0}
          intermediates="100+"
          hiddenStrokes={true}
          draw={true}
          frameExport={true}
          support={t.supportDedicated}
          isEnterprise={true}
        />
      </div>

      <p className="font-mono text-[10px] text-neutral-400 mt-6 text-center">{t.priceExcludesTax}</p>
    </div>
  );
}
