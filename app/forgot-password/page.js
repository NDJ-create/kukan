"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";

export default function ForgotPasswordPage() {
  const [lang] = useLanguage();
  const t = translations[lang].auth;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(t.resetLinkSent);
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }} className="md:max-w-md">
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>{t.resetPasswordTitle}</h1>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>{t.resetPasswordDesc}</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder={t.emailPlaceholder}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, fontSize: 16, cursor: "pointer" }}
        >
          {loading ? "..." : t.sendResetLink}
        </button>
      </form>

      {message && <p style={{ color: "green", marginTop: 16 }}>{message}</p>}
      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

      <p style={{ marginTop: 24, fontSize: 14 }}>
        <a href="/login" style={{ textDecoration: "underline" }}>{t.backToLogin}</a>
      </p>
    </main>
  );
}
