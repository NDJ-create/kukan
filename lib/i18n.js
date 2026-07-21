export const translations = {
  fr: {
    hero: {
      eyebrow: "ACCÈS ANTICIPÉ",
      badge: "FAIT POUR LES ARTISTES TRADITIONNELS — PAS POUR LES REMPLACER",
      title: "L'espace entre tes poses clés,",
      titleHighlight: "animé par l'IA.",
      subtitle:
        "Kukan n'invente rien à partir de rien. Il interpole entre tes poses, dessinées à la main — sans jamais dessiner à ta place.",
      cta: "Rejoindre la bêta",
    },
    problem: {
      eyebrow: "LE PROBLÈME",
      title: "Le tweening manuel coûte du temps que tu n'as pas",
      points: [
        {
          title: "Des heures perdues",
          description: "Dessiner chaque image intermédiaire à la main ralentit toute production.",
        },
        {
          title: "Le personnage se déforme",
          description: "Les IA généralistes perdent les proportions et la cohérence d'une image à l'autre.",
        },
        {
          title: "Le style disparaît",
          description: "Les générateurs vidéo classiques lissent ton trait et effacent ton style.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "COMMENT ÇA MARCHE",
      title: "Trois étapes, ton style intact",
      steps: [
        {
          number: "01",
          title: "Télécharge tes poses clés",
          description:
            "Télécharge ta Pose A et ta Pose B (au format PNG, JPG ou scan) directement depuis ta galerie ou ton logiciel de dessin.",
        },
        {
          number: "02",
          title: "L'IA calcule l'in-betweening",
          description:
            "Kukan génère rapidement les images intermédiaires manquantes. L'algorithme analyse la structure de ton personnage pour créer une transition fluide, fidèle à ton trait.",
        },
        {
          number: "03",
          title: "Récupère ton animation",
          description:
            "Visualise le rendu immédiat et télécharge ton animation sous forme de mini-vidéo fluide, ou récupère les frames une par une pour les peaufiner.",
        },
      ],
    },
    differentiator: {
      eyebrow: "POURQUOI KUKAN",
      title: "L'interpolation contrôlée, pas la génération aléatoire",
      themLabel: "Générateurs vidéo autonomes",
      usLabel: "Kukan",
      rows: [
        { them: "Une seule image de départ", us: "Deux poses clés fournies par l'artiste" },
        { them: "Dessin généré par l'IA à partir de rien", us: "100% ton trait, ta main, ton crayon" },
        { them: "Déformation du personnage", us: "Cohérence stricte, zéro drift" },
        { them: "Style générique lissé", us: "Fidélité totale au line art d'origine" },
        { them: "Résultat imprévisible", us: "Mouvement contrôlé par l'artiste" },
      ],
    },
    waitlist: {
      eyebrow: "ON Y EST PRESQUE",
      title: "Rejoins les bêta-testeurs sélectionnés chaque samedi. Réserve ta place.",
      emailPlaceholder: "toi@exemple.com",
      softwareLabel: "Logiciel utilisé",
      softwarePlaceholder: "Choisis ton logiciel",
      softwareOptions: ["Procreate", "Clip Studio Paint", "Photoshop", "Autre"],
      cta: "Rejoindre la bêta",
      success: "Ta place est réservée. On te contacte avant la sélection du samedi.",
      error: "Une erreur est survenue, réessaie dans un instant.",
    },
    footer: {
      tagline: "The space between your keyframes, animated by AI.",
    },
  },

  en: {
    hero: {
      eyebrow: "EARLY ACCESS",
      badge: "BUILT FOR TRADITIONAL ARTISTS — NOT TO REPLACE THEM",
      title: "The space between your keyframes,",
      titleHighlight: "animated by AI.",
      subtitle:
        "Kukan doesn't invent anything from nothing. It interpolates between your poses, drawn by hand — it never draws for you.",
      cta: "Join the beta",
    },
    problem: {
      eyebrow: "THE PROBLEM",
      title: "Manual tweening eats time you don't have",
      points: [
        {
          title: "Hours lost",
          description: "Drawing every in-between frame by hand slows down any production.",
        },
        {
          title: "Character drift",
          description: "Generalist AI tools lose proportions and consistency frame to frame.",
        },
        {
          title: "Style gets erased",
          description: "Classic video generators smooth out your line art and flatten your style.",
        },
      ],
    },
    howItWorks: {
      eyebrow: "HOW IT WORKS",
      title: "Three steps, your style intact",
      steps: [
        {
          number: "01",
          title: "Upload your key poses",
          description:
            "Upload your Pose A and Pose B (as PNG, JPG, or scan) directly from your gallery or drawing app.",
        },
        {
          number: "02",
          title: "AI computes the in-betweening",
          description:
            "Kukan quickly generates the missing in-between frames. The algorithm analyzes your character's structure to create a smooth transition, true to your line art.",
        },
        {
          number: "03",
          title: "Get your animation",
          description:
            "Preview the result instantly and download your animation as a smooth mini-clip, or grab each frame separately to refine it.",
        },
      ],
    },
    differentiator: {
      eyebrow: "WHY KUKAN",
      title: "Controlled interpolation, not random generation",
      themLabel: "Autonomous video generators",
      usLabel: "Kukan",
      rows: [
        { them: "A single starting image", us: "Two key poses provided by the artist" },
        { them: "AI-drawn from nothing", us: "100% your line, your hand, your pencil" },
        { them: "Character deformation", us: "Strict consistency, zero drift" },
        { them: "Generic, smoothed style", us: "Full fidelity to the original line art" },
        { them: "Unpredictable result", us: "Motion controlled by the artist" },
      ],
    },
    waitlist: {
      eyebrow: "ALMOST THERE",
      title: "Join the beta testers selected every Saturday. Reserve your spot.",
      emailPlaceholder: "you@example.com",
      softwareLabel: "Software you use",
      softwarePlaceholder: "Pick your software",
      softwareOptions: ["Procreate", "Clip Studio Paint", "Photoshop", "Other"],
      cta: "Join the beta",
      success: "Your spot is reserved. We'll reach out before Saturday's selection.",
      error: "Something went wrong, please try again.",
    },
    footer: {
      tagline: "The space between your keyframes, animated by AI.",
    },
  },
};
