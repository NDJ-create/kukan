"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const KRITA_SVG_TUTORIAL = "https://github.com/MarkMoHR/JoSTC/blob/main/tutorials/Krita_vector_generation.md";
const KRITA_COMPLEMENT_TUTORIAL = "https://github.com/MarkMoHR/LayerInbetween/blob/main/tutorials/Krita_complement_strokes.md";

// Les entrées sans action sont affichées grisées : elles arriveront avec l'éditeur et Modal.
export default function MenuBar({ onHome, onNewGeneration, t }) {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    const closeOutside = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(null);
    };
    const closeOnEscape = (e) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("touchstart", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("touchstart", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const goHome = () => (onHome ? onHome() : router.push("/dashboard"));
  const newGeneration = () => (onNewGeneration ? onNewGeneration() : router.push("/dashboard?view=generate"));
  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  const openLink = (url) => window.open(url, "_blank", "noopener,noreferrer");

  const menus = [
    {
      id: "file",
      label: t.menuFile,
      items: [
        { label: t.newProjectLink, action: newGeneration },
        { label: t.menuOpen },
        "separator",
        { label: t.menuSave },
        { label: t.menuSaveAs },
        "separator",
        { label: t.menuImportPose },
        { label: t.menuImportSvg },
        { label: t.vectorizeLink, action: () => router.push("/dashboard/vectorize") },
        "separator",
        { label: t.menuExportGif },
        { label: t.menuExportPng },
        { label: t.menuExportSvg },
        { label: t.menuExportVideo },
        "separator",
        { label: t.menuHome, action: goHome },
        { label: t.logout, action: logout },
      ],
    },
    {
      id: "edit",
      label: t.menuEdit,
      items: [
        { label: t.undo },
        { label: t.redo },
        "separator",
        { label: t.menuCut },
        { label: t.menuCopy },
        { label: t.menuPaste },
        { label: t.menuDuplicate },
        { label: t.delete },
        "separator",
        { label: t.menuDuplicateAtoB },
      ],
    },
    {
      id: "view",
      label: t.menuView,
      items: [
        { label: t.menuZoomIn },
        { label: t.menuZoomOut },
        { label: t.menuZoom100 },
        { label: t.menuFit },
        "separator",
        { label: t.menuGrid },
        { label: t.menuGuides },
        { label: t.menuRulers },
        { label: t.menuOnionSkin },
        "separator",
        { label: t.menuFullscreen, action: toggleFullscreen },
      ],
    },
    {
      id: "workspace",
      label: t.menuWorkspace,
      items: [
        { label: t.menuWsGeneration, action: newGeneration },
        { label: t.hiddenStrokes, action: () => router.push("/dashboard/inversion") },
        { label: t.menuWsCorrection },
        { label: t.menuWsMinimal },
        "separator",
        { label: t.menuWsMine },
        { label: t.menuWsReset },
      ],
    },
    {
      id: "settings",
      label: t.menuSettingsTitle,
      items: [
        { label: t.profileTitle, action: () => router.push("/dashboard/profile") },
        { label: t.settings, action: () => router.push("/dashboard/settings") },
        { label: t.upgrade, action: () => router.push("/dashboard/billing") },
      ],
    },
    {
      id: "help",
      label: t.menuHelp,
      items: [
        { label: t.menuHelpSvg, action: () => openLink(KRITA_SVG_TUTORIAL) },
        { label: t.menuHelpComplement, action: () => openLink(KRITA_COMPLEMENT_TUTORIAL) },
      ],
    },
  ];

  return (
    <nav
      ref={barRef}
      className="hidden md:flex items-center h-8 px-2 bg-[var(--k-chrome)] text-[13px] text-[var(--k-text)]"
    >
      {menus.map((menu) => (
        <div key={menu.id} className="relative">
          <button
            onClick={() => setOpen(open === menu.id ? null : menu.id)}
            onMouseEnter={() => open && setOpen(menu.id)}
            className={`px-2.5 h-7 rounded transition-colors ${
              open === menu.id ? "bg-[var(--k-tab)]" : "hover:bg-[var(--k-tab)]"
            }`}
          >
            {menu.label}
          </button>

          {open === menu.id && (
            <div className="absolute left-0 top-full mt-0.5 min-w-[15rem] py-1 bg-[var(--k-document)] border border-[var(--k-border-strong)] rounded-md shadow-lg z-40">
              {menu.items.map((item, i) =>
                item === "separator" ? (
                  <div key={i} className="my-1 border-t border-[var(--k-border)]" />
                ) : (
                  <button
                    key={i}
                    disabled={!item.action}
                    onClick={() => { setOpen(null); item.action?.(); }}
                    className="w-full text-left px-3 py-1.5 transition-colors enabled:hover:bg-[var(--k-tab)] disabled:text-[var(--k-muted)] disabled:cursor-default"
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
