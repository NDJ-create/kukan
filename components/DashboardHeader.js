"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import MenuBar from "./MenuBar";

export default function DashboardHeader({ onHome, onNewGeneration, t }) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-30">
      <header className="bg-[var(--k-chrome)] border-b border-[var(--k-border)] flex items-center px-4 h-8">
        <button
          onClick={() => (onHome ? onHome() : router.push("/dashboard"))}
          className="flex items-center gap-1.5 font-display text-sm italic tracking-tight text-[var(--k-text)] hover:opacity-70 transition-opacity"
        >
          <Image src="/kukan-icon.png" alt="Kukan" width={18} height={18} className="rounded" />
          Kukan
        </button>
      </header>
      <MenuBar onHome={onHome} onNewGeneration={onNewGeneration} t={t} />
    </div>
  );
}
