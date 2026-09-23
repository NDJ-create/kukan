"use client";

import { useState } from "react";
import LoadingState from "./LoadingState";

export default function ResultPanel({ status, outputGifUrl, genId, startedAt, resultError, session, onDeleted, t }) {
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareMessage, setShareMessage] = useState(null);

  const handleDownload = async () => {
    const response = await fetch(outputGifUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kukan-animation.gif";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Kukan", url: outputGifUrl });
      } catch {
        // annulé par l'utilisateur
      }
    } else {
      await navigator.clipboard.writeText(outputGifUrl);
      setShareMessage(t.linkCopied);
      setTimeout(() => setShareMessage(null), 2000);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t.confirmDelete)) return;
    setDeleting(true);
    const res = await fetch(`/api/generations/${genId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setDeleting(false);
    if (res.ok) onDeleted();
  };

  const IconButton = ({ onClick, label, children }) => (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-md border border-[var(--k-border-strong)] bg-[var(--k-document)] flex items-center justify-center text-[var(--k-text)] hover:border-[var(--k-muted)] transition-colors"
    >
      {children}
    </button>
  );

  return (
    <section className="px-6 py-6 text-[var(--k-text)]">
      <h2 className="font-display text-lg italic mb-5">{t.result}</h2>

      <div className="border border-[var(--k-border-strong)] rounded-lg min-h-64 flex items-center justify-center text-center px-4 bg-[var(--k-document)]">
        {status === "pending" || status === "processing" ? (
          <LoadingState startedAt={startedAt} t={t} />
        ) : status === "completed" && outputGifUrl ? (
          <img src={outputGifUrl} alt={t.result} className="max-h-64 object-contain" />
        ) : status === "failed" ? (
          <span className="font-mono text-xs text-red-600">{resultError || t.genericError}</span>
        ) : (
          <span className="font-mono text-xs text-[var(--k-text-secondary)]">{t.resultPlaceholder}</span>
        )}
      </div>

      {status === "completed" && outputGifUrl && (
        <div className="flex items-center gap-2 mt-4">
          <IconButton onClick={() => setShowFullscreen(true)} label={t.fullscreen}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </IconButton>
          <IconButton onClick={handleDownload} label={t.download}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </IconButton>
          <IconButton onClick={handleShare} label={t.share}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 3.9M15.4 6.6L8.6 10.5" />
            </svg>
          </IconButton>
          <IconButton onClick={handleDelete} label={t.delete}>
            {deleting ? (
              <span className="text-[10px] font-mono">...</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
              </svg>
            )}
          </IconButton>
          {shareMessage && (
            <span className="font-mono text-[10px] text-[var(--k-text-secondary)]">{shareMessage}</span>
          )}
        </div>
      )}

      {showFullscreen && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
          onClick={() => setShowFullscreen(false)}
        >
          <img src={outputGifUrl} alt={t.resultFullscreen} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </section>
  );
}
