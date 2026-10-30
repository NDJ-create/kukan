// Limite d'appels par utilisateur, fenêtre glissante, en mémoire.
// Limite : la mémoire est propre à chaque instance serveur (Vercel peut en lancer plusieurs).
// C'est une première barrière ; la limite commune à toutes les instances viendra avec Supabase (E2).
const fenetres = new Map();

export function verifierLimite(cle, maxAppels, fenetreMs) {
  const maintenant = Date.now();
  const appels = (fenetres.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);

  if (appels.length >= maxAppels) {
    fenetres.set(cle, appels);
    return { autorise: false, reessayerDansS: Math.ceil((fenetreMs - (maintenant - appels[0])) / 1000) };
  }

  appels.push(maintenant);
  fenetres.set(cle, appels);

  // Ménage : on ne garde pas les utilisateurs inactifs.
  if (fenetres.size > 10_000) {
    for (const [k, v] of fenetres) {
      if (!v.length || maintenant - v[v.length - 1] >= fenetreMs) fenetres.delete(k);
    }
  }
  return { autorise: true };
}
