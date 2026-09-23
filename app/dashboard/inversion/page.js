"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import MobileNav from "../../../components/MobileNav";
import ResultPanel from "../../../components/ResultPanel";

export default function InversionPage() {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [lang] = useLanguage();
  const t = translations[lang].dashboard;

  const [showExample, setShowExample] = useState(true);
  const [poseAUrl, setPoseAUrl] = useState(null);
  const [poseBUrl, setPoseBUrl] = useState(null);
  const [uploadingA, setUploadingA] = useState(false);
  const [uploadingB, setUploadingB] = useState(false);

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

      if (profileData) {
        setPlan({ ...profileData.plans, avatar_icon: profileData.avatar_icon });
        setShowExample(!profileData.hide_inversion_example);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleReopenExample = async () => {
    setShowExample(true);
    if (user) {
      await supabase
        .from("profiles")
        .update({ hide_inversion_example: false })
        .eq("id", user.id);
    }
  };

  const handleCloseExample = async () => {
    setShowExample(false);
    if (user) {
      await supabase
        .from("profiles")
        .update({ hide_inversion_example: true })
        .eq("id", user.id);
    }
  };

  const uploadImage = async (file, which) => {
    if (!file || !user) return;
    const setUploading = which === "A" ? setUploadingA : setUploadingB;
    const setUrl = which === "A" ? setPoseAUrl : setPoseBUrl;

    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;

    const { error } = await supabase.storage
      .from("generation-inputs")
      .upload(path, file);

    if (!error) {
      const { data } = supabase.storage.from("generation-inputs").getPublicUrl(path);
      setUrl(data.publicUrl);
    }
    setUploading(false);
  };

  const handleFileChange = (e, which) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImage(file, which);
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--k-canvas)] flex items-center justify-center font-mono text-sm">...</main>;
  }

  const canGenerate = poseAUrl && poseBUrl;

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader plan={plan} userId={user?.id} avatarIcon={plan?.avatar_icon} onLogout={handleLogout} t={t} />

      <div className="md:grid md:grid-cols-12">

        <div className="md:col-span-12">
          <h1 className="font-display text-2xl px-6 pt-8 mb-6">{t.hiddenStrokesTitle}</h1>

          <div className="md:grid md:grid-cols-10">
            {/* Colonne gauche : Pose A/B + Générer */}
            <section className="md:col-span-5 px-6 pb-8 self-start md:shadow-[4px_0_12px_-2px_rgba(0,0,0,0.08)]">
              <h2 className="font-display text-xl mb-6">{t.inputImages}</h2>

              <div className="mb-4 relative">
                <div className="text-xs font-mono uppercase tracking-widest mb-2">{t.poseA}</div>
                <label className="block cursor-pointer">
                  <div className="border border-dashed border-black rounded-md h-40 flex flex-col items-center justify-center text-center px-4">
                    {poseAUrl ? (
                      <img src={poseAUrl} alt="Pose A" className="h-full object-contain" />
                    ) : (
                      <span className="font-mono text-xs text-neutral-500">
                        {uploadingA ? t.uploading : t.uploadPrompt}
                      </span>
                    )}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, "A")} />
                </label>
              </div>

              <div className="mb-6 relative">
                <div className="text-xs font-mono uppercase tracking-widest mb-2">{t.poseB}</div>
                <label className="block cursor-pointer">
                  <div className="border border-dashed border-black rounded-md h-40 flex flex-col items-center justify-center text-center px-4">
                    {poseBUrl ? (
                      <img src={poseBUrl} alt="Pose B" className="h-full object-contain" />
                    ) : (
                      <span className="font-mono text-xs text-neutral-500">
                        {uploadingB ? t.uploading : t.uploadPrompt}
                      </span>
                    )}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, "B")} />
                </label>
              </div>

              <button
                disabled={!canGenerate}
                className="w-full py-3 rounded-md bg-black text-white font-mono text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {t.generate}
              </button>
            </section>

            {/* Colonne droite : vrai Résultat + exemple repliable en dessous */}
            <section className="md:col-span-5 px-6 pb-8 self-start">
              <ResultPanel
                status={null}
                outputGifUrl={null}
                resultError={null}
                t={t}
              />

              {!showExample && (
                <button
                  onClick={handleReopenExample}
                  className="mt-6 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-black underline"
                >
                  {t.showExample}
                </button>
              )}

              {showExample && (
                <div className="relative border border-black rounded-md p-4 mt-6 bg-neutral-50">
                  <button
                    onClick={handleCloseExample}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-neutral-600 hover:text-black"
                    aria-label="Fermer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                  <p className="text-sm text-neutral-700 leading-relaxed pr-6 mb-4">{t.hiddenStrokesLong}</p>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="border border-black rounded-md h-24 flex items-center justify-center text-center px-2">
                      <span className="font-mono text-[9px] text-neutral-500">{t.step1Title}</span>
                    </div>
                    <div className="border border-black rounded-md h-24 flex items-center justify-center text-center px-2">
                      <span className="font-mono text-[9px] text-neutral-500">{t.step2Title}</span>
                    </div>
                    <div className="border border-black rounded-md h-24 flex items-center justify-center text-center px-2">
                      <span className="font-mono text-[9px] text-neutral-500">{t.step3Title}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
