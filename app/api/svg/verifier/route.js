import { createClient } from "@supabase/supabase-js";
import { callModal } from "../../../../lib/modalServer";

// Vérification d'un SVG d'artiste par le moteur (Modal CPU, kukan_verifier_svg, quelques s, 0 $).
// Entrée : multipart/form-data avec "svg" (fichier ou texte), "image" (PNG ou JPEG de la pose), "apercu" ("0" pour s'en passer).
// Sortie : la réponse de verifier, l'aperçu PNG en base64 (apercu_png_base64).
// Contrat complet : docs/cahier_session_frontend.md § 6.6.

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Vercel refuse un corps de requête au-delà de 4,5 Mo : on reste en dessous, marge du multipart comprise.
const MAX_REQUETE_OCTETS = 4 * 1024 * 1024;
const MAX_SVG_OCTETS = 1.5 * 1024 * 1024;
const MAX_IMAGE_OCTETS = 2.5 * 1024 * 1024;
const DELAI_MODAL_MS = 50_000;
const MAX_APPELS_MINUTE = 10;

function erreur(status, code, message, extra = {}) {
  return Response.json({ error_code: code, error_message: message, ...extra }, { status });
}

// Le moteur lève une exception sur un fichier qui n'est pas une image : on le reconnaît à ses premiers octets.
function estPngOuJpeg(octets) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (octets.length >= 8 && png.every((b, i) => octets[i] === b)) return true;
  return octets.length >= 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff;
}

export async function POST(request) {
  try {
    // --- 1. Taille de la requête, avant toute lecture ---
    const taille = Number(request.headers.get("content-length") || 0);
    if (taille > MAX_REQUETE_OCTETS) {
      return erreur(413, "REQUETE_TROP_GROSSE", "Requête plus grosse que 4 Mo (SVG ≤ 1,5 Mo, image ≤ 2,5 Mo)");
    }

    // --- 2. Authentification ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return erreur(401, "NON_AUTHENTIFIE", "Non authentifié");
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return erreur(401, "SESSION_INVALIDE", "Session invalide");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_deactivated, plans(verify_svg_daily_limit)")
      .eq("id", user.id)
      .single();

    if (!profile || profile.is_deactivated) {
      return erreur(403, "COMPTE_INACTIF", "Compte désactivé ou profil introuvable");
    }

    // --- 3. Lire et contrôler les entrées ---
    let form;
    try {
      form = await request.formData();
    } catch {
      return erreur(400, "ENTREE_INVALIDE", "Formulaire multipart attendu (svg, image)");
    }

    const svgField = form.get("svg");
    const imageField = form.get("image");
    const apercu = form.get("apercu") !== "0";

    if (!svgField || !imageField || typeof imageField === "string") {
      return erreur(400, "ENTREE_INVALIDE", "Champs « svg » et « image » obligatoires");
    }

    if (typeof svgField !== "string" && svgField.size > MAX_SVG_OCTETS) {
      return erreur(413, "SVG_TROP_GROS", "SVG plus gros que 1,5 Mo");
    }
    const svg = typeof svgField === "string" ? svgField : await svgField.text();
    if (!svg.trim()) {
      return erreur(400, "SVG_VIDE", "SVG vide");
    }
    if (Buffer.byteLength(svg) > MAX_SVG_OCTETS) {
      return erreur(413, "SVG_TROP_GROS", "SVG plus gros que 1,5 Mo");
    }

    if (imageField.size > MAX_IMAGE_OCTETS) {
      return erreur(413, "IMAGE_TROP_GROSSE", "Image plus grosse que 2,5 Mo");
    }
    const image = new Uint8Array(await imageField.arrayBuffer());
    if (!estPngOuJpeg(image)) {
      return erreur(415, "IMAGE_FORMAT", "Image PNG ou JPEG attendue");
    }

    // --- 4. Quotas (Supabase, take_api_call) : seuls les appels qui partent vers le moteur sont comptés ---
    // La limite du jour vient du plan, lue côté serveur ; le compteur est commun à toutes les instances.
    const limiteJour = profile.plans?.verify_svg_daily_limit;
    if (!Number.isInteger(limiteJour)) {
      return erreur(503, "QUOTA_INDISPONIBLE", "Quota du plan introuvable");
    }

    const quotas = [
      { route: "verify_svg:minute", max: MAX_APPELS_MINUTE, secondes: 60, code: "TROP_D_APPELS",
        message: `Au plus ${MAX_APPELS_MINUTE} vérifications par minute` },
      { route: "verify_svg:day", max: limiteJour, secondes: 86400, code: "QUOTA_JOUR",
        message: `Quota du jour atteint (${limiteJour} vérifications)` },
    ];

    for (const quota of quotas) {
      const { data, error } = await supabase.rpc("take_api_call", {
        p_route: quota.route,
        p_max: quota.max,
        p_window_seconds: quota.secondes,
      });
      const prise = Array.isArray(data) ? data[0] : null;
      if (error || !prise) {
        console.error("take_api_call :", error);
        return erreur(503, "QUOTA_INDISPONIBLE", "Le compteur de quota ne répond pas");
      }
      if (!prise.allowed) {
        return Response.json(
          { error_code: quota.code, error_message: quota.message, utilises: prise.used },
          { status: 429, headers: { "Retry-After": String(prise.retry_after_s) } }
        );
      }
    }

    // --- 5. Appeler le moteur (CPU, sans GPU) ---
    let resultat;
    try {
      resultat = await callModal("kukan_verifier_svg", [svg, image], { apercu }, DELAI_MODAL_MS);
    } catch (err) {
      if (err.message === "MODAL_NON_CONFIGURE") {
        return erreur(503, "MODAL_NON_CONFIGURE", "Le moteur n'est pas configuré sur ce serveur");
      }
      if (err.message === "DELAI_DEPASSE") {
        return erreur(504, "DELAI_DEPASSE", "Le moteur n'a pas répondu à temps");
      }
      console.error("kukan_verifier_svg :", err);
      return erreur(502, "MOTEUR_ECHEC", "Le moteur a renvoyé une erreur");
    }

    // --- 6. SVG refusé par le moteur : 422, avec le corps du moteur ---
    if (!resultat || resultat.ok !== true) {
      const { apercu_png: _ignore, ...corps } = resultat ?? {};
      return erreur(
        422,
        corps.erreur?.code || "SVG_REFUSE",
        corps.erreur?.message || "SVG refusé par le moteur",
        { ...corps, ok: false }
      );
    }

    // --- 7. Renvoyer la réponse (aperçu en base64) ---
    const { apercu_png, ...reste } = resultat;
    return Response.json({
      ...reste,
      apercu_png_base64: apercu_png ? Buffer.from(apercu_png).toString("base64") : null,
    });

  } catch (err) {
    console.error("/api/svg/verifier :", err);
    return erreur(500, "ERREUR_SERVEUR", "Erreur serveur");
  }
}
