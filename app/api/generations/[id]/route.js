import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function DELETE(request, { params }) {
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

    // --- 2. Récupérer la génération et vérifier la propriété ---
    const { data: generation, error: fetchError } = await supabase
      .from("generations")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !generation) {
      return Response.json({ error: "Génération introuvable" }, { status: 404 });
    }

    if (generation.user_id !== user.id) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    // --- 3. Extraire les chemins de fichiers depuis les URLs stockées ---
    const extractPath = (url, bucket) => {
      if (!url) return null;
      const marker = `/storage/v1/object/public/${bucket}/`;
      const idx = url.indexOf(marker);
      if (idx === -1) return null;
      return url.substring(idx + marker.length);
    };

    const refPath = extractPath(generation.ref_image_url, "generation-inputs");
    const tarPath = extractPath(generation.tar_image_url, "generation-inputs");
    const outputPath = extractPath(generation.output_gif_url, "generation-outputs");

    // --- 4. Supprimer les fichiers du Storage ---
    if (refPath || tarPath) {
      const inputPaths = [refPath, tarPath].filter(Boolean);
      await supabase.storage.from("generation-inputs").remove(inputPaths);
    }

    if (outputPath) {
      await supabase.storage.from("generation-outputs").remove([outputPath]);
    }

    // --- 5. Supprimer la ligne en base ---
    const { error: deleteError } = await supabase
      .from("generations")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return Response.json({ error: "Erreur suppression: " + deleteError.message }, { status: 500 });
    }

    return Response.json({ ok: true });

  } catch (err) {
    return Response.json({ error: "Erreur serveur: " + err.message }, { status: 500 });
  }
}
