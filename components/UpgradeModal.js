"use client";

export default function UpgradeModal({ onClose, onUpgrade, t }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-6">
      <div className="bg-white border border-black rounded-md p-6 max-w-sm w-full">
        <h2 className="font-display text-xl mb-3">{t.upgradeModalTitle}</h2>
        <p className="text-sm text-neutral-600 mb-6">{t.upgradeModalText}</p>

        <button
          onClick={onUpgrade}
          className="w-full py-3 rounded-md bg-black text-white font-mono text-xs uppercase tracking-widest mb-2"
        >
          {t.upgradeModalCta}
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-md border border-neutral-300 font-mono text-xs uppercase tracking-widest text-neutral-500"
        >
          {t.upgradeModalDismiss}
        </button>
      </div>
    </div>
  );
}
