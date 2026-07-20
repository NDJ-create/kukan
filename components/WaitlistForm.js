"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function WaitlistForm({ t }) {
  const [email, setEmail] = useState("");
  const [software, setSoftware] = useState("");
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isValid = /\S+@\S+\.\S+/.test(email);
    if (!isValid || !software) {
      setStatus("error");
      return;
    }

    setStatus("submitting");

    const { error } = await supabase
      .from("animation_leads")
      .insert([{ email, software }]);

    if (error) {
      console.error("Erreur Supabase :", error.message);
      setStatus("error");
      return;
    }

    setStatus("success");
  };

  if (status === "success") {
    return (
      <section id="waitlist" className="py-16 px-6 border-t border-black text-center">
        <p className="max-w-sm mx-auto">{t.waitlist.success}</p>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-16 px-6 border-t border-black">
      <p className="font-mono text-[11px] tracking-[0.2em] text-center mb-4">{t.waitlist.eyebrow}</p>
      <h2 className="font-display text-2xl text-center mb-10 max-w-sm mx-auto">{t.waitlist.title}</h2>

      <form onSubmit={handleSubmit} noValidate className="max-w-sm mx-auto space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.waitlist.emailPlaceholder}
          className="w-full border border-black rounded-md px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-black"
        />

        <select
          value={software}
          onChange={(e) => setSoftware(e.target.value)}
          className="w-full border border-black rounded-md px-4 py-3 text-sm outline-none bg-white focus:ring-1 focus:ring-black"
        >
          <option value="" disabled>
            {t.waitlist.softwarePlaceholder}
          </option>
          {t.waitlist.softwareOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        {status === "error" && (
          <p className="text-sm text-red-600">{t.waitlist.error}</p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-md bg-black text-white text-sm font-medium py-3.5 hover:bg-neutral-800 transition-colors duration-200 disabled:opacity-50"
        >
          {t.waitlist.cta}
        </button>
      </form>
    </section>
  );
}
