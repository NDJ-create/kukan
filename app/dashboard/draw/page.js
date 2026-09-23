"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import { createStudioTranslator } from "../../../lib/studio-i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import CanvasAnimationPro from "../../../components/CanvasAnimationPro/CanvasAnimationPro";

export default function DrawPage() {
  const router = useRouter();
  const [lang] = useLanguage();
  const locale = lang === "en" ? "en" : "fr";
  const t = translations[locale].dashboard;
  const st = createStudioTranslator(locale);

  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const {
          data: { user: authenticatedUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (cancelled) return;

        if (!authenticatedUser) {
          router.replace("/login");
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*, plans(*)")
          .eq("id", authenticatedUser.id)
          .single();

        if (profileError) throw profileError;
        if (cancelled) return;

        setUser(authenticatedUser);
        setPlan(
          profile
            ? {
                ...profile.plans,
                avatar_icon: profile.avatar_icon,
              }
            : null,
        );
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;

        console.error(cause);
        setError("errorPageLoad");
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    if (!window.confirm(st("confirmLogout"))) {
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      setError("errorLogout");
      return;
    }

    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-sm">
        {st("loading")}
      </main>
    );
  }

  if (error && !user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
        <p role="alert">{st(error)}</p>
        <button
          className="rounded border px-4 py-2"
          onClick={() => window.location.reload()}
        >
          {st("retry")}
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <DashboardHeader
        plan={plan}
        userId={user?.id}
        avatarIcon={plan?.avatar_icon}
        onLogout={handleLogout}
        t={t}
      />

      {error && (
        <p role="alert" className="bg-red-50 p-3 text-sm text-red-700">
          {st(error)}
        </p>
      )}

      <CanvasAnimationPro lang={locale} />
    </main>
  );
}
