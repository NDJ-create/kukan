import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

export async function POST(request) {
  try {
    // Client admin : ignore RLS, utilisé uniquement côté serveur.
    // Créé à la requête (et non au chargement) pour que le build ne dépende d'aucune clé.
    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);

    const payload = await request.json();

    const predictionId = payload.id;
    const status = payload.status; // "succeeded", "failed", "canceled"

    if (!predictionId) {
      return Response.json({ error: "id de prédiction manquant" }, { status: 400 });
    }

    // --- 1. Retrouver la génération correspondante ---
    const { data: generation, error: fetchError } = await supabaseAdmin
      .from("generations")
      .select("*")
      .eq("replicate_prediction_id", predictionId)
      .single();

    if (fetchError || !generation) {
      return Response.json({ error: "Génération introuvable pour cette prédiction" }, { status: 404 });
    }

    // --- 2. Gérer l'échec ---
    if (status === "failed" || status === "canceled") {
      await supabaseAdmin
        .from("generations")
        .update({ status: "failed" })
        .eq("id", generation.id);

      return Response.json({ ok: true, status: "failed" });
    }

    // --- 3. Gérer le succès ---
    if (status === "succeeded") {
      const outputUrl = Array.isArray(payload.output) ? payload.output[0] : payload.output;

      if (!outputUrl) {
        await supabaseAdmin
          .from("generations")
          .update({ status: "failed" })
          .eq("id", generation.id);
        return Response.json({ error: "Aucune sortie fournie par Replicate" }, { status: 400 });
      }

      // Télécharger le GIF depuis l'URL temporaire de Replicate
      const gifResponse = await fetch(outputUrl);
      if (!gifResponse.ok) {
        throw new Error("Échec du téléchargement du GIF depuis Replicate");
      }
      const gifBuffer = await gifResponse.arrayBuffer();

      // Réuploader vers Supabase Storage (stockage permanent)
      const outputPath = `${generation.user_id}/${generation.id}.gif`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("generation-outputs")
        .upload(outputPath, gifBuffer, {
          contentType: "image/gif",
          upsert: true,
        });

      if (uploadError) {
        throw new Error("Échec upload vers Supabase Storage: " + uploadError.message);
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("generation-outputs")
        .getPublicUrl(outputPath);

      // Mettre à jour la génération
      await supabaseAdmin
        .from("generations")
        .update({
          status: "completed",
          output_gif_url: publicUrlData.publicUrl,
        })
        .eq("id", generation.id);

      return Response.json({ ok: true, status: "completed" });
    }

    // Statut intermédiaire (processing, starting...) : on met juste à jour le statut
    await supabaseAdmin
      .from("generations")
      .update({ status: "processing" })
      .eq("id", generation.id);

    return Response.json({ ok: true, status: "processing" });

  } catch (err) {
    return Response.json({ error: "Erreur serveur: " + err.message }, { status: 500 });
  }
}
