"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";
import PasswordInput from "../../components/PasswordInput";
import SuccessCheck from "../../components/SuccessCheck";

export default function SignupPage() {
  const [lang] = useLanguage();
  const t = translations[lang].auth;
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState("");
  const successTitleRef = useRef(null);

  // Le titre du succès prend le focus : le lecteur d'écran l'annonce, le clavier repart de là.
  useEffect(() => {
    if (submittedEmail) successTitleRef.current?.focus();
  }, [submittedEmail]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

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
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSubmittedEmail(email);
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }} className="md:max-w-md">
      <button
        onClick={() => router.push("/")}
        style={{ marginBottom: 24, fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "#666" }}
      >
        ← {t.backToHome}
      </button>

      {!submittedEmail && <h1 style={{ fontSize: 28, marginBottom: 24 }}>{t.signupTitle}</h1>}

      {!submittedEmail && (
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
      )}

      {/* Région toujours présente : son contenu est annoncé quand l'inscription réussit. */}
      <div role="status" aria-live="polite">
        {submittedEmail && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
            <SuccessCheck />
            <h1
              ref={successTitleRef}
              tabIndex={-1}
              style={{ fontSize: 28, margin: 0, outline: "none", color: "var(--k-text)" }}
            >
              {t.signupSuccessTitle}
            </h1>
            <p style={{ margin: 0, color: "var(--k-text-secondary)" }}>{t.signupSuccessBody}</p>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--k-text)", wordBreak: "break-all" }}>{submittedEmail}</p>
            <p style={{ margin: 0, fontSize: 14, color: "var(--k-text-secondary)" }}>{t.signupSuccessHint}</p>
          </div>
        )}
      </div>

      {error && <p role="alert" style={{ color: "red", marginTop: 16 }}>{error}</p>}

      <p style={{ marginTop: 24, fontSize: 14 }}>
        {lang === "fr" ? "Déjà un compte ?" : "Already have an account?"}{" "}
        <a href="/login" style={{ textDecoration: "underline" }}>{t.loginButton}</a>
      </p>
    </main>
  );
}
