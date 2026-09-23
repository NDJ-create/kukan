"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH = 52;
const MAX_WIDTH = 220;
const COLLAPSE_THRESHOLD = 90;
const DEFAULT_WIDTH = 52;
const STORAGE_KEY = "kukan_sidebar_width";

export default function Sidebar({ plan, onNavigateProfile, onNavigateSettings, onLogout, t }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  const collapsed = width < COLLAPSE_THRESHOLD;

  const startDrag = useCallback((e) => {
    if (e.type === "mousedown") e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const updateWidth = (clientX) => {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, clientX)));
    };
    const onMouseMove = (e) => {
      if (draggingRef.current) updateWidth(e.clientX);
    };
    const onTouchMove = (e) => {
      if (draggingRef.current && e.touches.length === 1) updateWidth(e.touches[0].clientX);
    };
    const endDrag = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => (w < COLLAPSE_THRESHOLD ? MIN_WIDTH : w));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", endDrag);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", endDrag);
    };
  }, []);

  const NavItem = ({ onClick, label, icon }) => (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-left font-mono text-[11px] uppercase tracking-widest text-[var(--k-text)] hover:bg-[var(--k-tab)] transition-colors ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0">{icon}</span>
      {!collapsed && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );

  return (
    <aside
      className="hidden md:block relative shrink-0 bg-[var(--k-chrome)] border-r border-[var(--k-border)]"
      style={{ width: `${width}px` }}
    >
      <div className="sticky top-0 flex flex-col gap-0.5 px-1.5 py-2" style={{ height: "calc(100vh - 43px)" }}>
        <NavItem
          onClick={onNavigateProfile}
          label={t.profileTitle}
          icon={
            <span className="w-6 h-6 rounded-full border border-[var(--k-border-strong)] bg-[var(--k-document)] flex items-center justify-center font-mono text-[10px]">
              {(plan?.display_name || "?")[0]}
            </span>
          }
        />

        <div className="flex-1" />

        <NavItem
          onClick={onLogout}
          label={t.logout}
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          }
        />
        <NavItem
          onClick={onNavigateSettings}
          label={t.settings}
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          }
        />
      </div>

      <div
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        className="absolute top-0 -right-1.5 h-full w-3 cursor-col-resize z-50"
      />
    </aside>
  );
}
