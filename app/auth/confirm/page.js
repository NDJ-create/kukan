"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useLanguage } from "../../../lib/useLanguage";
import { translations } from "../../../lib/i18n";

// Confirmation des liens reçus par e-mail (inscription, réinitialisation du mot de passe).
// Deux formats acceptés :
//   - ?token_hash=…&type=…&next=…  (modèles d'e-mail Supabase avec {{ .TokenHash }}) : verifyOtp ;
//   - #access_token=…              (modèle par défaut {{ .ConfirmationURL }}, flux implicite) : session lue
//     dans l'adresse par le client Supabase à sa création.
// La redirection finale ne va que vers un chemin du site (jamais vers un autre domaine).

const TYPES_OTP = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

function cheminInterne(next, defaut) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return defaut;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return defaut;
    return url.pathname + url.search;
  } catch {
    return defaut;
  }
}

export default function AuthConfirmPage() {
  const [lang] = useLanguage();
  const t = translations[lang].auth;
  const router = useRouter();

  const [etat, setEtat] = useState("chargement"); // chargement | succes | expire | invalide
  const [recuperation, setRecuperation] = useState(false);
  const [email, setEmail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoiFait, setEnvoiFait] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const dejaTraite = useRef(false);

  useEffect(() => {
    // Un lien ne sert qu'une fois : on ne le traite pas deux fois (double rendu en développement).
    if (dejaTraite.current) return;
    dejaTraite.current = true;

    const confirmer = async () => {
      const query = new URLSearchParams(window.location.search);
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const type = query.get("type") || fragment.get("type");
      const estRecuperation = type === "recovery";
      const destination = cheminInterne(query.get("next"), estRecuperation ? "/reset-password" : "/dashboard");
      setRecuperation(estRecuperation);

      const tokenHash = query.get("token_hash");
      const aJetonImplicite = fragment.has("access_token");
      const aErreur = fragment.has("error") || query.has("error");

      let ok = false;
      if (aErreur) {
        ok = false;
      } else if (tokenHash && TYPES_OTP.includes(type)) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        ok = !error;
      } else if (aJetonImplicite) {
        // La création du client lit et enregistre la session présente dans l'adresse.
        const { data } = await supabase.auth.getSession();
        ok = Boolean(data?.session);
      } else {
        setEtat("invalide");
        return;
      }

      // Le jeton ne reste pas dans la barre d'adresse ni dans l'historique.
      window.history.replaceState(null, "", "/auth/confirm");

      if (ok) {
        setEtat("succes");
        router.replace(destination);
      } else {
        setEtat("expire");
      }
    };

    confirmer();
  }, [router]);

  const renvoyer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreurEnvoi("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard` },
    });
    setEnvoi(false);
    if (error) {
      setErreurEnvoi(error.message);
      return;
    }
    setEnvoiFait(true);
  };

  const titre = {
    chargement: t.confirmLoading,
    succes: t.confirmSuccess,
    expire: t.confirmExpiredTitle,
    invalide: t.confirmInvalidTitle,
  }[etat];

  const enErreur = etat === "expire" || etat === "invalide";

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24 }} className="md:max-w-md">
      <div role="status" aria-live="polite">
        <h1 style={{ fontSize: 28, marginBottom: 16, color: "var(--k-text)" }}>{titre}</h1>

        {enErreur && recuperation && (
          <>
            <p style={{ color: "var(--k-text-secondary)", marginBottom: 16 }}>{t.recoveryExpiredBody}</p>
            <a href="/forgot-password" style={{ textDecoration: "underline" }}>{t.requestNewResetLink}</a>
          </>
        )}

        {enErreur && !recuperation && (
          <p style={{ color: "var(--k-text-secondary)", marginBottom: 16 }}>
            {etat === "expire" ? t.confirmExpiredBody : t.confirmInvalidBody}
          </p>
        )}

        {envoiFait && <p style={{ color: "var(--k-text)" }}>{t.resendDone}</p>}
      </div>

      {enErreur && !recuperation && !envoiFait && (
        <form onSubmit={renvoyer} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder={t.emailPlaceholder}
            aria-label={t.emailPlaceholder}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 10, fontSize: 16 }}
          />
          <button type="submit" disabled={envoi} style={{ padding: 12, fontSize: 16, cursor: "pointer", minHeight: 44 }}>
            {envoi ? t.resendLoading : t.resendButton}
          </button>
        </form>
      )}

      {erreurEnvoi && <p role="alert" style={{ color: "red", marginTop: 16 }}>{erreurEnvoi}</p>}

      <p style={{ marginTop: 24, fontSize: 14 }}>
        <a href="/login" style={{ textDecoration: "underline" }}>{t.backToLogin}</a>
      </p>
    </main>
  );
}
