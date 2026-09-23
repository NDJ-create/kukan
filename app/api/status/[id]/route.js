import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    // --- 1. Authentification ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    // --- 2. Récupérer la génération ---
    const { data: generation, error: fetchError } = await supabase
      .from("generations")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !generation) {
      return Response.json({ error: "Génération introuvable" }, { status: 404 });
    }

    // --- 3. Vérifier que l'utilisateur est bien le propriétaire ---
    if (generation.user_id !== user.id) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    // --- 4. Renvoyer le statut ---
    return Response.json({
      id: generation.id,
      status: generation.status,
      outputGifUrl: generation.output_gif_url,
      createdAt: generation.created_at,
    });

  } catch (err) {
    return Response.json({ error: "Erreur serveur: " + err.message }, { status: 500 });
  }
}
