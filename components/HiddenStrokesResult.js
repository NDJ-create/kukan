"use client";

import { useState } from "react";
import ResultPanel from "./ResultPanel";
import { useAlignedHeight } from "../lib/useAlignedHeight";

const DocIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

const isSvgFile = (file) =>
  !!file && (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"));

export default function HiddenStrokesResult({ step, tar0Url, completedSvgUrl, onCompletedSvg, formBottom, t, ...rest }) {
  const [dragOver, setDragOver] = useState(false);
  const { sectionRef, cardRef, height } = useAlignedHeight(formBottom);

  if (step === "done") return <ResultPanel t={t} formBottom={formBottom} {...rest} />;

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (isSvgFile(file)) onCompletedSvg({ target: { files: [file] } });
  };

  return (
    <section ref={sectionRef} className="px-6 py-6 text-[var(--k-text)]">
      <h2 className="font-display text-lg italic mb-5">{t.result}</h2>

      {step === "idle" ? (
        <div ref={cardRef} style={{ height }} className="border border-[var(--k-border-strong)] rounded-lg min-h-64 flex items-center justify-center text-center px-4 bg-[var(--k-document)]">
          <span className="font-mono text-xs text-[var(--k-text-secondary)]">{t.hiddenIdle}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <a
            href={tar0Url || undefined}
            download="pose_b_vector.svg"
            aria-disabled={!tar0Url}
            className={`w-full py-3 rounded-md border border-[var(--k-border-strong)] bg-[var(--k-document)] text-center font-mono text-xs uppercase tracking-widest transition-colors ${
              tar0Url ? "hover:border-[var(--k-muted)]" : "opacity-40 pointer-events-none"
            }`}
          >
            {t.hiddenDownloadVector}
          </a>

          <ol className="flex flex-col gap-2.5 text-sm">
            {[t.hiddenStep1, t.hiddenStep2, t.hiddenStep3].map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-xs text-[var(--k-text-secondary)] pt-0.5">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={handleDrop}
            className={`h-40 border border-dashed rounded-lg cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors ${
              dragOver ? "border-[var(--k-text)] bg-[var(--k-tab)]" : "border-[var(--k-muted)] hover:bg-[var(--k-tab)]/40"
            }`}
          >
            {completedSvgUrl ? (
              <img src={completedSvgUrl} alt={t.hiddenDropCompleted} className="h-full object-contain py-2" />
            ) : (
              <>
                <span className="text-[var(--k-muted)]"><DocIcon /></span>
                <span className="font-mono text-xs text-[var(--k-text-secondary)]">{t.hiddenDropCompleted}</span>
              </>
            )}
            <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={onCompletedSvg} />
          </label>
        </div>
      )}
    </section>
  );
}
