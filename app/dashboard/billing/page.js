"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";
import DashboardHeader from "../../../components/DashboardHeader";
import MobileNav from "../../../components/MobileNav";
import PricingCards from "../../../components/PricingCards";

export default function BillingPage() {
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
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

      if (profileData) setPlan({ ...profileData.plans, avatar_icon: profileData.avatar_icon });
      setLoading(false);
    };
    load();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleChoosePlan = (planId) => {
    console.log("Choisir le plan:", planId);
    // TODO: branchement Stripe checkout
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--k-canvas)] flex items-center justify-center font-mono text-sm">...</main>;
  }

  return (
    <main className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-text)]">
      <DashboardHeader plan={plan} userId={user?.id} avatarIcon={plan?.avatar_icon} onLogout={handleLogout} t={t} />

      <div className="md:grid md:grid-cols-12">

        <section className="md:col-span-12 px-6 py-8">
          <h1 className="font-display text-2xl mb-2">{t.billingTitle}</h1>
          <p className="text-neutral-600 text-sm mb-8">{t.billingSubtitle}</p>

          <PricingCards t={t} onChoosePlan={handleChoosePlan} currentPlanId={plan?.id} />
        </section>
      </div>
      <MobileNav t={t} />
      <div className="md:hidden h-16" />
    </main>
  );
}
