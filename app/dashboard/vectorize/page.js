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
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [lang] = useLanguage();
  const t = translations[lang].dashboard;

  const [sourceImageUrl, setSourceImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*, plans(*)")
        .eq("id", user.id)
        .single();

      if (profileData?.is_deactivated) {
        router.push("/account-deactivated");
        return;
      }

      if (profileData) {
        const fullPlan = { ...profileData.plans, avatar_icon: profileData.avatar_icon };
        setPlan(fullPlan);
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const loadImageFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    const url = URL.createObjectURL(file);
    setSourceImageUrl(url);
    setUploading(false);
  };

  const handleFileSelect = (e) => {
    loadImageFile(e.target.files?.[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    loadImageFile(e.dataTransfer.files?.[0]);
  };

  const handleCanvasSave = (blob) => {
    console.log("SVG/PNG pret, blob:", blob);
  };

  if (loading) return null;

  if (sourceImageUrl) {
    return (
      <DrawingCanvas
        backgroundImageUrl={sourceImageUrl}
        onSave={handleCanvasSave}
        onCancel={() => setSourceImageUrl(null)}
        t={t}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader plan={plan} userId={user?.id} avatarIcon={plan?.avatar_icon} onLogout={handleLogout} t={t} />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`max-w-2xl mx-auto px-6 py-16 my-8 text-center border-2 border-dashed rounded-lg transition-colors ${
          dragActive ? "border-black bg-neutral-50" : "border-transparent"
        }`}
      >
        <h1 className="text-2xl lg:text-4xl font-semibold mb-8">{t.vectorizeTitle}</h1>
        <label className="inline-block cursor-pointer border-b border-black/20 hover:border-black/50 transition text-lg pb-1">
          <input type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          {uploading ? t.vectorizeLoading : t.vectorizeImport}
        </label>
        <p className="mt-3 text-sm text-neutral-500">{t.vectorizeDragHint}</p>
      </div>

      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
