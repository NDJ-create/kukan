"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";
import PasswordInput from "../../components/PasswordInput";

export default function LoginPage() {
  const [lang] = useLanguage();
  const t = translations[lang].auth;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }} className="md:max-w-md">
      <button
        onClick={() => router.push("/")}
        style={{ marginBottom: 24, fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "#666" }}
      >
        ← {t.backToHome}
      </button>

      <h1 style={{ fontSize: 28, marginBottom: 24 }}>{t.loginTitle}</h1>

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder={t.emailPlaceholder}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />
        <PasswordInput
          placeholder={t.passwordPlaceholder}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, fontSize: 16, cursor: "pointer" }}
        >
          {loading ? t.loginLoading : t.loginButton}
        </button>
      </form>

      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

      <p style={{ marginTop: 16, fontSize: 13 }}>
        <a href="/forgot-password" style={{ textDecoration: "underline", color: "#666" }}>{t.forgotPassword}</a>
      </p>

      <p style={{ marginTop: 12, fontSize: 14 }}>
        {lang === "fr" ? "Pas de compte ?" : "No account yet?"}{" "}
        <a href="/signup" style={{ textDecoration: "underline" }}>{t.signupButton}</a>
      </p>
    </main>
  );
}
