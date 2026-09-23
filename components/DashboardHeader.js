"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

export default function DashboardHeader({ onHome }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 bg-[var(--k-chrome)] border-b border-[var(--k-border)] flex items-center px-4 py-1.5">
      <button
        onClick={() => (onHome ? onHome() : router.push("/dashboard"))}
        className="flex items-center gap-1.5 font-display text-sm italic tracking-tight text-[var(--k-text)] hover:opacity-70 transition-opacity"
      >
        <Image src="/kukan-icon.png" alt="Kukan" width={18} height={18} className="rounded" />
        Kukan
      </button>
    </header>
  );
}
