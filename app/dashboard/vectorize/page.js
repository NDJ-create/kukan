"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import DrawingCanvas from "../../../components/DrawingCanvas";
import MobileNav from "../../../components/MobileNav";

export default function VectorizePage() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [lang] = useLanguage();
  const t = translations[lang].dashboard;

  const [sourceImageUrl, setSourceImageUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: profileData } = await supabase
        .from("profiles")
        .select("is_deactivated")
        .eq("id", user.id)
        .single();
      if (profileData?.is_deactivated) {
        router.push("/account-deactivated");
        return;
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const loadImageFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setSourceImageUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    loadImageFile(e.dataTransfer.files?.[0]);
  };

  if (loading) return null;

  if (sourceImageUrl) {
    return (
      <DrawingCanvas
        backgroundImageUrl={sourceImageUrl}
        onSave={(blob) => console.log("SVG/PNG pret, blob:", blob)}
        onCancel={() => setSourceImageUrl(null)}
        t={t}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader t={t} />

      <section className="w-full max-w-3xl mx-auto px-6 py-8 lg:py-14">
        <h1 className="text-2xl font-semibold mb-8 lg:mb-10">{t.vectorizeTitle}</h1>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-4 h-72 border border-dashed rounded-lg cursor-pointer transition-colors ${
            dragActive
              ? "border-[var(--k-text)] bg-[var(--k-tab)]"
              : "border-[var(--k-muted)] hover:bg-[var(--k-tab)]/40"
          }`}
        >
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-[var(--k-text-secondary)]">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            <path d="M12 16v-5M9.5 13.5L12 11l2.5 2.5" />
          </svg>
          <span className="text-base text-[var(--k-text)]">{t.vectorizeDropPrompt}</span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--k-text-secondary)]">PNG · JPG</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => loadImageFile(e.target.files?.[0])}
          />
        </label>
      </section>

      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
