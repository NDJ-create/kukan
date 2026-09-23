"use client";

import { useEffect, useState } from "react";

export default function LoadingState({ startedAt, t }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = elapsedSeconds / 60;

  let message = t.loadingStep1;
  if (minutes >= 2) message = t.loadingStep3;
  else if (minutes >= 1) message = t.loadingStep2;

  // Progression : avance jusqu'à 90% sur 5 min, puis se fige
  const progress = Math.min(99, (minutes / 5) * 99);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-6 px-4">
      {/* Icône animée : deux cercles reliés par un trait qui pulse */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute left-0 w-4 h-4 rounded-full border-2 border-black" />
        <div className="absolute right-0 w-4 h-4 rounded-full border-2 border-black" />
        <div className="w-full h-px bg-black relative overflow-hidden">
          <div className="absolute inset-0 bg-black animate-[pulse_1.5s_ease-in-out_infinite]" style={{ transformOrigin: "center" }} />
        </div>
        <svg className="absolute animate-spin" style={{ animationDuration: "3s" }} width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="black" strokeWidth="1" strokeDasharray="4 6" opacity="0.3" />
        </svg>
      </div>

      <p className="font-mono text-xs text-neutral-600 text-center">{message}</p>

      <div className="w-full max-w-xs h-1 bg-neutral-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-black transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
