"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useLanguage } from "../../lib/useLanguage";
import { translations } from "../../lib/i18n";
import PasswordInput from "../../components/PasswordInput";

export default function ResetPasswordPage() {
  const [lang] = useLanguage();
  const t = translations[lang].auth;
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(t.passwordResetSuccess);
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }} className="md:max-w-md">
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>{t.newPasswordTitle}</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PasswordInput
          placeholder={t.passwordPlaceholder}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordInput
          placeholder={t.confirmNewPassword}
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, fontSize: 16, cursor: "pointer" }}
        >
          {loading ? "..." : t.updatePassword}
        </button>
      </form>

      {message && <p style={{ color: "green", marginTop: 16 }}>{message}</p>}
      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}
    </main>
  );
}
