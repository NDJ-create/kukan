"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";

export default function AccountDeactivatedPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [lang] = useLanguage();
  const t = translations[lang].dashboard;

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      setLoading(false);
    };
    check();
  }, []);

  const handleReactivate = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ is_deactivated: false }).eq("id", user.id);
    router.push("/dashboard");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return <main className="min-h-screen bg-white flex items-center justify-center font-mono text-sm">...</main>;
  }

  return (
    <main className="min-h-screen bg-white text-black flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-2xl mb-4">{t.accountDeactivatedTitle}</h1>
        <p className="text-neutral-600 text-sm mb-8">{t.accountDeactivatedText}</p>

        <button
          onClick={handleReactivate}
          className="w-full py-3 rounded-md bg-black text-white font-mono text-xs uppercase tracking-widest mb-3"
        >
          {t.reactivateAccount}
        </button>

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-md border border-black font-mono text-xs uppercase tracking-widest"
        >
          {t.logout}
        </button>
      </div>
    </main>
  );
}
