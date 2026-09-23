"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";
import PasswordInput from "../../components/PasswordInput";

export default function SignupPage() {
  const [lang] = useLanguage();
  const t = translations[lang].auth;
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: username.trim() || null },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(t.signupSuccess);
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }} className="md:max-w-md">
      <button
        onClick={() => router.push("/")}
        style={{ marginBottom: 24, fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "#666" }}
      >
        ← {t.backToHome}
      </button>

      <h1 style={{ fontSize: 28, marginBottom: 24 }}>{t.signupTitle}</h1>

      <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordInput
          placeholder={t.confirmPasswordPlaceholder}
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <input
          type="text"
          placeholder={t.usernamePlaceholder}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: 10, fontSize: 16 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, fontSize: 16, cursor: "pointer" }}
        >
          {loading ? t.signupLoading : t.signupButton}
        </button>
      </form>

      {message && <p style={{ color: "green", marginTop: 16 }}>{message}</p>}
      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

      <p style={{ marginTop: 24, fontSize: 14 }}>
        {lang === "fr" ? "Déjà un compte ?" : "Already have an account?"}{" "}
        <a href="/login" style={{ textDecoration: "underline" }}>{t.loginButton}</a>
      </p>
    </main>
  );
}
