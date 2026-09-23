"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const RECENT_CLEARED_KEY = "kukan_recent_cleared_at";

const FolderPlusIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </svg>
);

const FolderIcon = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

const accountIcons = {
  upgrade: <path d="M12 19V5M5 12l7-7 7 7" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

export default function StartScreen({
  onNewProject, onNavigateProfile, onNavigateSettings, onUpgrade, onLogout, t,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recent, setRecent] = useState([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [preview, setPreview] = useState(null);
  const logoutRef = useRef(null);
  const cardRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(null);

  useEffect(() => {
    const measure = () => {
      const logout = logoutRef.current, card = cardRef.current;
      if (!logout || !card) return;
      const rect = logout.getBoundingClientRect();
      if (!rect.height) { setCardHeight(null); return; }
      setCardHeight(Math.max(256, Math.round(rect.bottom - card.getBoundingClientRect().top)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);
  const router = useRouter();

  useEffect(() => {
    const loadRecent = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let query = supabase
        .from("generations")
        .select("id, output_gif_url, created_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .not("output_gif_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);
      const clearedAt = localStorage.getItem(RECENT_CLEARED_KEY);
      if (clearedAt) query = query.gt("created_at", clearedAt);
      const { data } = await query;
      setRecent(data || []);
      setRecentLoaded(true);
    };
    loadRecent();
  }, []);

  const clearRecent = () => {
    localStorage.setItem(RECENT_CLEARED_KEY, new Date().toISOString());
    setRecent([]);
  };

  const subItem = (label, onClick) => (
    <button onClick={onClick} className="block text-left py-1">
      <span className="text-lg lg:text-base underline underline-offset-4 hover:decoration-2 transition">
        {label}
      </span>
    </button>
  );

  const accountItem = (icon, label, onClick, ref) => (
    <button ref={ref} onClick={onClick} className="flex items-center gap-3 py-2 text-left">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0">
        {accountIcons[icon]}
      </svg>
      <span className="text-sm underline underline-offset-4 hover:decoration-2 transition">{label}</span>
    </button>
  );

  return (
    <section className="flex-1 flex flex-col md:flex-row gap-12 lg:gap-20 px-6 py-8 lg:px-16 lg:py-14 text-[var(--k-text)]">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold mb-8 lg:mb-10">{t.startTitle}</h1>

        <button
          onClick={() => setMenuOpen((value) => !value)}
          className="flex items-center gap-3 text-left ml-8 lg:ml-12"
        >
          <FolderPlusIcon />
          <span className="text-lg lg:text-base underline underline-offset-4 hover:decoration-2 transition">
            {t.newProjectLink}
          </span>
        </button>

        {menuOpen && (
          <div className="flex flex-col mt-2 ml-[5.5rem] lg:ml-[6.5rem]">
            {subItem(t.newGeneration, () => { setMenuOpen(false); onNewProject(); })}
            {subItem(t.hiddenStrokes, () => { setMenuOpen(false); router.push("/dashboard/inversion"); })}
            {subItem(t.vectorizeLink, () => { setMenuOpen(false); router.push("/dashboard/vectorize"); })}
          </div>
        )}

        <button className="flex items-center gap-3 text-left mt-8 lg:mt-10 ml-12 lg:ml-20">
          <FolderIcon />
          <span className="text-lg lg:text-base underline underline-offset-4 hover:decoration-2 transition">
            {t.myProjectsLink}
          </span>
        </button>

        <div className="hidden md:block mt-16 ml-6 lg:ml-8">
          <button onClick={onNavigateProfile} className="flex items-center gap-3 text-left group mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
            </svg>
            <span className="text-xl font-semibold group-hover:underline underline-offset-4">{t.profileTitle}</span>
          </button>

          <div className="flex flex-col gap-1.5 ml-6">
            {accountItem("upgrade", t.upgrade, onUpgrade)}
            {accountItem("settings", t.settings, onNavigateSettings)}
            {accountItem("logout", t.logout, onLogout, logoutRef)}
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 max-w-4xl">
        <div className="w-full md:w-3/4">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl font-semibold">{t.recentTitle}</h2>
          {recent.length > 0 && (
            <button
              onClick={clearRecent}
              className="text-sm underline underline-offset-4 text-[var(--k-text-secondary)] hover:text-[var(--k-text)] transition-colors"
            >
              {t.recentClear}
            </button>
          )}
        </div>

        <div ref={cardRef} style={{ height: cardHeight ?? undefined }} className="border border-[var(--k-border-strong)] rounded-lg bg-[var(--k-document)] p-4 min-h-64 overflow-y-auto">
          {recentLoaded && recent.length === 0 ? (
            <div className="h-full min-h-56 flex items-center justify-center text-center">
              <span className="font-mono text-xs text-[var(--k-text-secondary)]">{t.recentEmpty}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {recent.map((item) => (
                <button key={item.id} onClick={() => setPreview(item.output_gif_url)} className="text-left group">
                  <div className="aspect-square border border-[var(--k-border)] rounded-md overflow-hidden bg-white group-hover:border-[var(--k-muted)] transition-colors">
                    <img src={item.output_gif_url} alt="" className="w-full h-full object-contain" />
                  </div>
                  <span className="block mt-1.5 font-mono text-[10px] text-[var(--k-text-secondary)]">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <img src={preview} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </section>
  );
}
