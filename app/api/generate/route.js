import { createClient } from "@supabase/supabase-js";
import Replicate from "replicate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(request) {
  try {
    // --- 1. Authentification : extraire le token envoyé par le frontend ---
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    // Client Supabase lié à l'utilisateur (pas admin), pour vérifier le token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Session invalide" }, { status: 401 });
    }

    // --- 2. Lire le body de la requête ---
    const body = await request.json();
    const { refImageUrl, tarImageUrl, numIntermediates, curve } = body;

    if (!refImageUrl || !tarImageUrl) {
      return Response.json({ error: "Images manquantes" }, { status: 400 });
    }

    // --- 3. Récupérer le profil + plan de l'utilisateur ---
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*, plans(*)")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return Response.json({ error: "Profil introuvable" }, { status: 404 });
    }

    const plan = profile.plans;

    // --- 4. Vérifier le nombre d'intermédiaires demandé ---
    const requestedIntermediates = numIntermediates || 1;
    if (requestedIntermediates > plan.max_intermediates) {
      return Response.json(
        { error: `Ton plan (${plan.display_name}) autorise au maximum ${plan.max_intermediates} intermédiaires.` },
        { status: 403 }
      );
    }

    // --- 5. Vérifier le nombre de générations ce mois-ci ---
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfMonth.toISOString());

    if (count >= plan.monthly_generation_limit) {
      return Response.json(
        { error: `Limite mensuelle atteinte (${plan.monthly_generation_limit} générations sur ton plan ${plan.display_name}).` },
        { status: 403 }
      );
    }

    // --- 6. Créer la ligne "pending" dans generations ---
    const { data: generation, error: insertError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        status: "pending",
        ref_image_url: refImageUrl,
        tar_image_url: tarImageUrl,
      })
      .select()
      .single();

    if (insertError) {
      return Response.json({ error: "Erreur création génération: " + insertError.message }, { status: 500 });
    }

    // --- 7. Déclencher Replicate en mode asynchrone (webhook) ---
    const webhookUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhook`;

    const prediction = await replicate.predictions.create({
      model: "ndj-create/kukan-inbetween",
      input: {
        ref_image: refImageUrl,
        tar_image: tarImageUrl,
        num_intermediate: requestedIntermediates,
        curve: curve || 0,
      },
      webhook: webhookUrl,
      webhook_events_filter: ["completed"],
    });

    // --- 8. Sauvegarder l'id de prédiction Replicate ---
    await supabase
      .from("generations")
      .update({ replicate_prediction_id: prediction.id })
      .eq("id", generation.id);

    return Response.json({ generationId: generation.id, status: "pending" });

  } catch (err) {
    return Response.json({ error: "Erreur serveur: " + err.message }, { status: 500 });
  }
}
