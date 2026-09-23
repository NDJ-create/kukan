"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import MobileNav from "../../../components/MobileNav";
import { Cat, Dog, Bird, Rabbit, Fish, Turtle, Squirrel, Bug, PawPrint, Ghost, Smile, Laugh, Frown, Angry, Meh, User, UserRound, Crown, Heart, Star } from "lucide-react";

const AVATAR_ICONS = {
  default: null,
  cat: Cat,
  dog: Dog,
  bird: Bird,
  rabbit: Rabbit,
  fish: Fish,
  turtle: Turtle,
  squirrel: Squirrel,
  bug: Bug,
  paw: PawPrint,
  ghost: Ghost,
  smile: Smile,
  laugh: Laugh,
  frown: Frown,
  angry: Angry,
  meh: Meh,
  user: User,
  userRound: UserRound,
  crown: Crown,
  heart: Heart,
  star: Star,
};

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generationsThisMonth, setGenerationsThisMonth] = useState(0);
  const [currentIcon, setCurrentIcon] = useState("default");
  const [newEmail, setNewEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const router = useRouter();
  const [lang] = useLanguage();
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

      if (profileData) {
        setPlan({ ...profileData.plans, avatar_icon: profileData.avatar_icon });
        setCurrentIcon(profileData.avatar_icon || "default");
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from("generations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startOfMonth.toISOString());

      setGenerationsThisMonth(count || 0);
      setLoading(false);
    };
    load();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const chooseIcon = async (key) => {
    setCurrentIcon(key);
    if (user) {
      await supabase.from("profiles").update({ avatar_icon: key }).eq("id", user.id);
    }
  };

  const handleUpdateEmail = async () => {
    setEmailMessage("");
    setEmailError("");

    const { error } = await supabase.auth.updateUser({ email: newEmail });

    if (error) {
      setEmailError(error.message);
      return;
    }

    setEmailMessage(t.emailUpdateSent);
    setShowEmailForm(false);
    setNewEmail("");
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--k-canvas)] flex items-center justify-center font-mono text-sm">...</main>;
  }

  const remaining = Math.max(0, (plan?.monthly_generation_limit || 0) - generationsThisMonth);
  const isFree = plan?.id === "free";

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader plan={plan} userId={user?.id} avatarIcon={plan?.avatar_icon} onLogout={handleLogout} t={t} />

      <div className="md:grid md:grid-cols-12">

        <section className="md:col-span-12 w-full max-w-3xl px-6 py-8 lg:px-16 lg:py-14">
          <h1 className="font-display text-2xl mb-8">{t.profileTitle}</h1>

          {/* Icône */}
          <div className="mb-8 pb-8 border-b border-neutral-200">
            <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500 mb-4">{t.chooseAvatar}</h2>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-w-md">
              <button
                onClick={() => chooseIcon("default")}
                className={`w-10 h-10 rounded-full border flex items-center justify-center font-mono text-xs ${currentIcon === "default" ? "border-black bg-neutral-100" : "border-neutral-300"}`}
              >
                {(plan?.display_name || "?")[0]}
              </button>
              {Object.entries(AVATAR_ICONS).filter(([key]) => key !== "default").map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => chooseIcon(key)}
                  className={`w-10 h-10 rounded-full border flex items-center justify-center ${currentIcon === key ? "border-black bg-neutral-100" : "border-neutral-300"}`}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>

          {/* Email */}
          <div className="mb-8 pb-8 border-b border-neutral-200">
            <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500 mb-4">{t.accountSection}</h2>

            <div className="flex items-end justify-between mb-3">
              <div>
                <div className="text-xs text-neutral-500 mb-0.5">{t.emailLabel}</div>
                <div className="text-sm">{user?.email}</div>
              </div>
              <button
                onClick={() => setShowEmailForm(!showEmailForm)}
                className="font-mono text-[10px] uppercase tracking-widest underline text-neutral-600 hover:text-black translate-y-[-5px]"
              >
                {t.changeAction}
              </button>
            </div>

            {showEmailForm && (
              <div className="flex gap-2 mt-3">
                <input
                  type="email"
                  placeholder={t.newEmailPlaceholder}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="flex-1 border border-black rounded-md px-3 py-2 text-sm"
                />
                <button
                  onClick={handleUpdateEmail}
                  className="px-4 py-2 rounded-md bg-black text-white font-mono text-[10px] uppercase tracking-widest"
                >
                  {t.updateEmail}
                </button>
              </div>
            )}

            {emailMessage && <p className="text-green-600 text-xs mt-2">{emailMessage}</p>}
            {emailError && <p className="text-red-600 text-xs mt-2">{emailError}</p>}
          </div>

          {/* Utilisation */}
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-neutral-500 mb-4">{t.usageSection}</h2>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm">{t.currentPlanLabel}</span>
              <span className="text-sm font-medium">{plan?.display_name}</span>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm">{t.generationsUsed}</span>
              <span className="text-sm font-medium">
                {generationsThisMonth} / {plan?.monthly_generation_limit}
              </span>
            </div>

            <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-black"
                style={{ width: `${Math.min(100, (generationsThisMonth / (plan?.monthly_generation_limit || 1)) * 100)}%` }}
              />
            </div>

            <p className="text-xs text-neutral-500 mb-4">{remaining} générations restantes ce mois</p>

            {isFree && (
              <button
                onClick={() => router.push("/dashboard/billing")}
                className="w-full py-2.5 rounded-md bg-black text-white font-mono text-[10px] uppercase tracking-widest"
              >
                {t.upgrade}
              </button>
            )}
          </div>
        </section>
      </div>
      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
