"use client";

import VintageButton from "./VintageButton";

export default function LayerDpad({ onUp, onDown, onFront, onBack, disabled, t }) {
  return (
    <div className="relative w-28 h-28 mx-auto">
      <div className="absolute top-0 left-1/2 -translate-x-1/2">
        <VintageButton onClick={onUp} disabled={disabled} title={t.moveUp}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </VintageButton>
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
        <VintageButton onClick={onDown} disabled={disabled} title={t.moveDown}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </VintageButton>
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2">
        <VintageButton onClick={onBack} disabled={disabled} title={t.sendToBack}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </VintageButton>
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2">
        <VintageButton onClick={onFront} disabled={disabled} title={t.bringToFront}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </VintageButton>
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-8 h-8 rounded-full border border-neutral-300" />
      </div>
    </div>
  );
}
