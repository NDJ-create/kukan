"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import DockableWorkspace from "../../../components/DockableWorkspace";
import MobileNav from "../../../components/MobileNav";

// En local uniquement : l'étape 1 passe à l'écran de l'étape 2 pour prévisualiser l'interface.
const IS_DEV = process.env.NODE_ENV === "development";

export default function HiddenStrokesPage() {
  const router = useRouter();
  const [lang] = useLanguage();
  const t = translations[lang].dashboard;

  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const [poseAUrl, setPoseAUrl] = useState(null);
  const [poseBUrl, setPoseBUrl] = useState(null);
  const [uploadingA, setUploadingA] = useState(false);
  const [uploadingB, setUploadingB] = useState(false);
  const [svgAUrl, setSvgAUrl] = useState(null);
  const [formBottom, setFormBottom] = useState(null);
  const [numIntermediates, setNumIntermediates] = useState(1);
  const [curve, setCurve] = useState(0);

  const [step, setStep] = useState("idle");
  const [tar0Url] = useState(null);
  const [completedSvgUrl, setCompletedSvgUrl] = useState(null);
  const [resultError, setResultError] = useState(null);

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
        .select("is_deactivated, plans(*)")
        .eq("id", user.id)
        .single();
      if (profileData?.is_deactivated) {
        router.push("/account-deactivated");
        return;
      }
      setPlan(profileData?.plans ?? null);
      setLoading(false);
    };
    load();
  }, [router]);

  const uploadToStorage = async (file, contentType) => {
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("generation-inputs")
      .upload(path, file, contentType ? { contentType } : undefined);
    if (error) {
      setResultError("Erreur upload : " + error.message);
      return null;
    }
    return supabase.storage.from("generation-inputs").getPublicUrl(path).data.publicUrl;
  };

  const handleFileChange = async (e, which) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const setUploading = which === "A" ? setUploadingA : setUploadingB;
    const setUrl = which === "A" ? setPoseAUrl : setPoseBUrl;
    setUploading(true);
    const url = await uploadToStorage(file);
    if (url) setUrl(url);
    setUploading(false);
  };

  const handleSvgChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const url = await uploadToStorage(file, "image/svg+xml");
    if (url) setSvgAUrl(url);
  };

  const handleCompletedSvg = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const url = await uploadToStorage(file, "image/svg+xml");
    if (url) setCompletedSvgUrl(url);
  };

  const incrementIntermediates = () => {
    const max = plan?.max_intermediates || 1;
    if (numIntermediates < max) setNumIntermediates(numIntermediates + 1);
  };

  const handleGenerate = () => {
    setResultError(null);
    if (step === "idle" && IS_DEV) {
      setStep("vector-ready");
      return;
    }
    setResultError(t.hiddenNotAvailable);
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--k-canvas)] flex items-center justify-center font-mono text-sm">...</main>;
  }

  const canGenerate = step === "idle" ? !!(poseAUrl && poseBUrl && svgAUrl) : !!completedSvgUrl;
  const maxReached = plan && numIntermediates >= plan.max_intermediates;

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader t={t} />

      <div className="md:flex" style={{ minHeight: "calc(100vh - var(--k-top))" }}>
        <DockableWorkspace
          mode="hidden"
          poseAUrl={poseAUrl}
          poseBUrl={poseBUrl}
          uploadingA={uploadingA}
          uploadingB={uploadingB}
          svgAUrl={svgAUrl}
          onSvgChange={handleSvgChange}
          numIntermediates={numIntermediates}
          plan={plan}
          maxReached={maxReached}
          curve={curve}
          onCurveChange={setCurve}
          onFileChange={handleFileChange} onFormBottom={setFormBottom} formBottom={formBottom}
          onIncrement={incrementIntermediates}
          onGenerate={handleGenerate}
          canGenerate={canGenerate}
          generating={false}
          resultError={resultError}
          generateLabel={step === "idle" ? t.hiddenPrepare : t.hiddenGenerate}
          step={step}
          tar0Url={tar0Url}
          completedSvgUrl={completedSvgUrl}
          onCompletedSvg={handleCompletedSvg}
          t={t}
        />
      </div>

      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
