"use client";

import { useEffect, useRef, useState } from "react";
import EasingSlider from "./EasingSlider";

const DocIcon = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

const isSvgFile = (file) =>
  !!file && (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"));

function PoseDropZone({ which, url, svgUrl, withSvg, uploading, onFileChange, onSvgChange, t, dragOver, setDragOver }) {
  const svgKey = `${which}-svg`;

  const dropOn = (kind) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const fake = { target: { files: [file] } };
    if (isSvgFile(file)) {
      if (withSvg) onSvgChange(fake, which);
      return;
    }
    if (kind === "image") onFileChange(fake, which);
  };

  const dragProps = (key, kind) => ({
    onDragOver: (e) => { e.preventDefault(); setDragOver(key); },
    onDragLeave: (e) => { e.preventDefault(); setDragOver(null); },
    onDrop: dropOn(kind),
  });

  const zoneBg = (key) => (dragOver === key ? "bg-[var(--k-tab)]" : "hover:bg-[var(--k-tab)]/40");

  return (
    <div className="flex h-40 border border-dashed border-[var(--k-muted)] rounded-lg overflow-hidden">
      <label {...dragProps(which, "image")} className={`flex-1 min-w-0 cursor-pointer flex flex-col items-center justify-center gap-2 px-4 text-center transition-colors ${zoneBg(which)}`}>
        {url ? (
          <img src={url} alt={`Pose ${which}`} className="h-full object-contain py-2" />
        ) : (
          <>
            <span className="text-[var(--k-muted)]"><DocIcon /></span>
            <span className="font-mono text-xs text-[var(--k-text-secondary)]">
              {uploading ? t.uploading : t.uploadPrompt}
            </span>
          </>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFileChange(e, which)} />
      </label>

      {withSvg && (
      <label {...dragProps(svgKey, "svg")} className={`w-20 shrink-0 border-l border-dashed border-[var(--k-muted)] cursor-pointer flex flex-col items-center justify-center gap-1.5 transition-colors ${zoneBg(svgKey)}`}>
        {svgUrl ? (
          <img src={svgUrl} alt={`SVG ${which}`} className="w-14 h-14 object-contain" />
        ) : (
          <span className="text-[var(--k-muted)]"><DocIcon size={20} /></span>
        )}
        <span className="font-mono text-[10px] tracking-widest text-[var(--k-text-secondary)]">SVG</span>
        <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(e) => onSvgChange(e, which)} />
      </label>
      )}
    </div>
  );
}

export default function GenerationForm({
  poseAUrl, poseBUrl, uploadingA, uploadingB,
  svgAUrl, onSvgChange,
  numIntermediates, plan, maxReached,
  curve, onCurveChange,
  onFileChange, onIncrement, onGenerate,
  canGenerate, generating, resultError, generateLabel, onFormBottom, t,
}) {
  const [dragOver, setDragOver] = useState(null);
  const sectionRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!onFormBottom) return;
    const measure = () => {
      const s = sectionRef.current, b = buttonRef.current;
      if (!s || !b) return;
      onFormBottom(Math.round(b.getBoundingClientRect().bottom - s.getBoundingClientRect().top));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [onFormBottom]);
  const label = "block mb-2 text-[11px] font-mono uppercase tracking-widest text-[var(--k-text-secondary)]";
  const zoneProps = { onFileChange, onSvgChange, t, dragOver, setDragOver };

  return (
    <section ref={sectionRef} className="px-6 py-6 text-[var(--k-text)]">
      <h2 className="font-display text-lg italic mb-5">{t.inputImages}</h2>

      <div className="mb-3">
        <span className={label}>{t.poseA}</span>
        <PoseDropZone which="A" url={poseAUrl} svgUrl={svgAUrl} withSvg uploading={uploadingA} {...zoneProps} />
      </div>

      <div className="flex items-center gap-3 my-4">
        <button
          onClick={onIncrement}
          disabled={maxReached}
          className="w-8 h-8 rounded-full border border-[var(--k-border-strong)] bg-[var(--k-document)] flex items-center justify-center text-base hover:border-[var(--k-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          +
        </button>
        <span className="font-mono text-xs text-[var(--k-text-secondary)]">
          {numIntermediates} {numIntermediates > 1 ? t.intermediates : t.intermediate} {plan ? `(${t.max} ${plan.max_intermediates})` : ""}
        </span>
      </div>

      <div className="mb-6">
        <span className={label}>{t.poseB}</span>
        <PoseDropZone which="B" url={poseBUrl} uploading={uploadingB} {...zoneProps} />
      </div>

      <EasingSlider curve={curve} onChange={onCurveChange} t={t} />

      <button
        ref={buttonRef}
        onClick={onGenerate}
        disabled={!canGenerate}
        className="w-full py-3 rounded-md bg-[var(--k-text-secondary)] text-white font-mono text-xs uppercase tracking-widest hover:bg-[#5a6268] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {generating ? t.generating : (generateLabel || t.generate)}
      </button>

      {resultError && <p className="text-red-600 font-mono text-xs mt-4">{resultError}</p>}
    </section>
  );
}
