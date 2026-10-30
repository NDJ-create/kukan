import { createClient } from "@supabase/supabase-js";
import { callModal } from "../../../../lib/modalServer";

// Vérification d'un SVG d'artiste par le moteur (Modal CPU, kukan_verifier_svg, quelques s, 0 $).
// Entrée : multipart/form-data avec "svg" (fichier ou texte), "image" (PNG ou JPEG de la pose), "apercu" ("0" pour s'en passer).
// Sortie : la réponse de verifier, l'aperçu PNG en base64 (apercu_png_base64).

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const MAX_SVG_OCTETS = 5 * 1024 * 1024;
const MAX_IMAGE_OCTETS = 20 * 1024 * 1024;
const TYPES_IMAGE = ["image/png", "image/jpeg"];
const DELAI_MODAL_MS = 50_000;

function erreur(status, code, message) {
  return Response.json({ error_code: code, error_message: message }, { status });
}

export async function POST(request) {
  try {
    // --- 1. Authentification ---
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
      .select("is_deactivated")
      .eq("id", user.id)
      .single();

    if (!profile || profile.is_deactivated) {
      return erreur(403, "COMPTE_INACTIF", "Compte désactivé ou profil introuvable");
    }

    // --- 2. Lire et contrôler les entrées ---
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

    const svg = typeof svgField === "string" ? svgField : await svgField.text();
    if (!svg.trim() || Buffer.byteLength(svg) > MAX_SVG_OCTETS) {
      return erreur(413, "SVG_TROP_GROS", "SVG vide ou plus gros que 5 Mo");
    }

    if (!TYPES_IMAGE.includes(imageField.type)) {
      return erreur(415, "IMAGE_FORMAT", "Image PNG ou JPEG attendue");
    }
    if (imageField.size > MAX_IMAGE_OCTETS) {
      return erreur(413, "IMAGE_TROP_GROSSE", "Image plus grosse que 20 Mo");
    }
    const image = new Uint8Array(await imageField.arrayBuffer());

    // --- 3. Appeler le moteur (CPU, sans GPU) ---
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

    // --- 4. Renvoyer la réponse (aperçu en base64) ---
    const { apercu_png, ...reste } = resultat ?? {};
    return Response.json({
      ...reste,
      apercu_png_base64: apercu_png ? Buffer.from(apercu_png).toString("base64") : null,
    });

  } catch (err) {
    console.error("/api/svg/verifier :", err);
    return erreur(500, "ERREUR_SERVEUR", "Erreur serveur");
  }
}
