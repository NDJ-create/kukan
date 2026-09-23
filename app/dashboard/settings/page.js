"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import MobileNav from "../../../components/MobileNav";

export default function SettingsPage() {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const router = useRouter();
  const [lang, setLang] = useLanguage();
  const t = translations[lang].dashboard;

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

      if (profileData) setPlan({ ...profileData.plans, avatar_icon: profileData.avatar_icon });
      setLoading(false);
    };
    load();
  }, []);

  const handleDeactivate = async () => {
    if (!confirm(t.deactivateWarning)) return;
    if (user) {
      await supabase.from("profiles").update({ is_deactivated: true }).eq("id", user.id);
    }
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleUpdatePassword = async () => {
    setPasswordMessage("");
    setPasswordError("");

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setPasswordMessage(t.passwordUpdated);
    setShowPasswordForm(false);
    setNewPassword("");
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--k-canvas)] flex items-center justify-center font-mono text-sm">...</main>;
  }

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader plan={plan} userId={user?.id} avatarIcon={plan?.avatar_icon} onLogout={handleLogout} t={t} />

      <div className="md:grid md:grid-cols-12">

        <section className="md:col-span-12 w-full max-w-3xl px-6 py-8 lg:px-16 lg:py-14">
          <h1 className="font-display text-2xl mb-8">{t.settingsTitle}</h1>

          {/* Préférences */}
          <div className="mb-8 pb-8 border-b border-neutral-200">
            <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500 mb-4">{t.preferencesSection}</h2>

            <div className="flex items-center justify-between">
              <span className="text-sm">{t.languageLabel}</span>
              <div className="flex items-center rounded-md border border-black p-0.5 font-mono text-xs">
                {["fr", "en"].map((code) => (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    className={`px-3 py-1 rounded-md uppercase tracking-widest transition-colors ${
                      lang === code ? "bg-black text-white" : "text-neutral-500"
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sécurité */}
          <div className="mb-8 pb-8 border-b border-neutral-200">
            <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500 mb-4">{t.securitySection}</h2>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm">{t.changePassword}</span>
              <button
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="font-mono text-[10px] uppercase tracking-widest underline text-neutral-600 hover:text-black"
              >
                {t.changeAction}
              </button>
            </div>

            {showPasswordForm && (
              <div className="flex gap-2 mt-3">
                <input
                  type="password"
                  placeholder={t.newPasswordPlaceholder}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  className="flex-1 border border-black rounded-md px-3 py-2 text-sm"
                />
                <button
                  onClick={handleUpdatePassword}
                  className="px-4 py-2 rounded-md bg-black text-white font-mono text-[10px] uppercase tracking-widest"
                >
                  {t.updatePassword}
                </button>
              </div>
            )}

            {passwordMessage && <p className="text-green-600 text-xs mt-2">{passwordMessage}</p>}
            {passwordError && <p className="text-red-600 text-xs mt-2">{passwordError}</p>}
          </div>

          {/* Zone sensible */}
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-red-600 mb-3">{t.dangerZone}</h2>
            <p className="text-xs text-neutral-600 mb-3">{t.deactivateWarning}</p>
            <button
              onClick={handleDeactivate}
              className="inline-block px-4 py-2 rounded-md border border-red-600 text-red-600 font-mono text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-colors"
            >
              {t.deactivateAccount}
            </button>
          </div>
        </section>
      </div>
      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
