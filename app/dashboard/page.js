"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";
import DashboardHeader from "../../components/DashboardHeader";
import DockableWorkspace from "../../components/DockableWorkspace";
import UpgradeModal from "../../components/UpgradeModal";
import MobileNav from "../../components/MobileNav";
import DrawingCanvas from "../../components/DrawingCanvas";
import InversionEditor from "../../components/InversionEditor";
import StartScreen from "../../components/StartScreen";

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [lang] = useLanguage();
  const t = translations[lang].dashboard;

  const [poseAUrl, setPoseAUrl] = useState(null);
  const [poseBUrl, setPoseBUrl] = useState(null);
  const [uploadingA, setUploadingA] = useState(false);
  const [uploadingB, setUploadingB] = useState(false);
  const [numIntermediates, setNumIntermediates] = useState(1);
  const [curve, setCurve] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [view, setView] = useState("start");

  const [genId, setGenId] = useState(null);
  const [genStatus, setGenStatus] = useState(null);
  const [outputGifUrl, setOutputGifUrl] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);
  const [editorBackground, setEditorBackground] = useState(null);
  const [svgAUrl, setSvgAUrl] = useState(null);

  const pollRef = useRef(null);
  const sessionRef = useRef(null);

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

        const alreadyShown = sessionStorage.getItem("kukan_upgrade_modal_shown");
        if (fullPlan.id === "free" && !alreadyShown) {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const { count } = await supabase
            .from("generations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("created_at", startOfMonth.toISOString());

          const remaining = (fullPlan.monthly_generation_limit || 0) - (count || 0);
          if (remaining <= 1) {
            setShowUpgradeModal(true);
            sessionStorage.setItem("kukan_upgrade_modal_shown", "true");
          }
        }
      }
      setLoading(false);
    };
    load();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
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

    if (error) {
      setResultError("Erreur upload : " + error.message);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("generation-inputs").getPublicUrl(path);
    setUrl(data.publicUrl);
    setUploading(false);
  };

  const handleFileChange = (e, which) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImage(file, which);
  };

  const handleSvgChange = async (e, which) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const setUrl = setSvgAUrl;
    const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("generation-inputs")
      .upload(path, file, { contentType: "image/svg+xml" });
    if (error) {
      setResultError("Erreur upload : " + error.message);
      return;
    }
    const { data } = supabase.storage.from("generation-inputs").getPublicUrl(path);
    setUrl(data.publicUrl);
  };

  const incrementIntermediates = () => {
    const max = plan?.max_intermediates || 1;
    if (numIntermediates < max) setNumIntermediates(numIntermediates + 1);
  };

  const pollStatus = (id, token) => {
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/status/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) return;

      setGenStatus(data.status);

      if (data.status === "completed") {
        setOutputGifUrl(data.outputGifUrl);
        clearInterval(pollRef.current);
      } else if (data.status === "failed") {
        setResultError("La génération a échoué.");
        clearInterval(pollRef.current);
      }
    }, 5000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResultError(null);
    setOutputGifUrl(null);
    setGenStatus("pending");
    setStartedAt(Date.now());

    const { data: { session } } = await supabase.auth.getSession();
    sessionRef.current = session;

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        refImageUrl: poseAUrl,
        tarImageUrl: poseBUrl,
        numIntermediates,
        curve,
      }),
    });

    const data = await res.json();
    setGenerating(false);

    if (!res.ok) {
      setResultError(data.error || "Erreur lors de la génération");
      setGenStatus("failed");
      return;
    }

    setGenId(data.generationId);
    pollStatus(data.generationId, session.access_token);
  };

  const openEditor = (which, mode) => {
    if (mode === "duplicate") {
      setEditorBackground(poseAUrl);
    } else if (mode === "current") {
      setEditorBackground(which === "A" ? poseAUrl : poseBUrl);
    } else {
      setEditorBackground(null);
    }
    setEditingTarget(which);
  };

  const handleEditorSave = async (blob) => {

    const setUploading = editingTarget === "A" ? setUploadingA : setUploadingB;
    const setUrl = editingTarget === "A" ? setPoseAUrl : setPoseBUrl;

    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}-drawn.png`;

    const { error } = await supabase.storage
      .from("generation-inputs")
      .upload(path, blob, { contentType: "image/png" });

    if (error) {
      setResultError("Erreur upload : " + error.message);
      setUploading(false);
      setEditingTarget(null);
      return;
    }

    const { data } = supabase.storage.from("generation-inputs").getPublicUrl(path);
    setUrl(data.publicUrl);
    setUploading(false);
    setEditingTarget(null);
  };

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleDeleted = () => {
    setGenId(null);
    setGenStatus(null);
    setOutputGifUrl(null);
    setResultError(null);
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--k-canvas)] flex items-center justify-center font-mono text-sm">...</main>;
  }

  const canGenerate = poseAUrl && poseBUrl && !generating && genStatus !== "pending" && genStatus !== "processing";
  const maxReached = plan && numIntermediates >= plan.max_intermediates;

  if (editingTarget) {
    return (
      <DrawingCanvas
        backgroundImageUrl={editorBackground}
        onCancel={() => setEditingTarget(null)}
        onSave={handleEditorSave}
        t={t}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader t={t} onHome={() => setView("start")} />

      <div className="md:flex" style={{ minHeight: "calc(100vh - 43px)" }}>

        {view === "start" && (
          <StartScreen
            onNewProject={() => setView("generate")}
            plan={plan}
            onNavigateProfile={() => router.push("/dashboard/profile")}
            onNavigateSettings={() => router.push("/dashboard/settings")}
            onUpgrade={() => router.push("/dashboard/billing")}
            onLogout={handleLogout}
            t={t}
          />
        )}

        {view === "generate" && (
          <DockableWorkspace
            poseAUrl={poseAUrl}
            poseBUrl={poseBUrl}
            uploadingA={uploadingA}
            uploadingB={uploadingB}
            numIntermediates={numIntermediates}
            plan={plan}
            maxReached={maxReached}
            curve={curve}
            onCurveChange={setCurve}
            onFileChange={handleFileChange} svgAUrl={svgAUrl} onSvgChange={handleSvgChange}
            onIncrement={incrementIntermediates}
            onGenerate={handleGenerate}
            canGenerate={canGenerate}
            generating={generating}
            resultError={resultError}
            onOpenEditor={openEditor}
            status={genStatus}
            outputGifUrl={outputGifUrl}
            genId={genId}
            startedAt={startedAt}
            session={sessionRef.current}
            onDeleted={handleDeleted}
            t={t}
          />
        )}
      </div>

      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={() => router.push("/dashboard/billing")}
          t={t}
        />
      )}
      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
