# État réel du dépôt frontend (`NDJ-create/kukan`) — 2026-10-30

Relevé fait en lecture seule, sans rien modifier. Il remplace les parties **[À VÉRIFIER — dépôt frontend]** de
`docs/cahier_session_frontend.md` (§ 2.9, 3.1, 3.6, 7, 10.3). En cas de conflit sur le frontend, ce document prime.

## 1. Pile
| Élément | Constat |
|---|---|
| Cadre | Next.js 16.2.10, **App Router** (`app/`), React 19.2 ; surtout JS, un peu de TS (`components/CanvasAnimationPro/*`, `lib/studio-i18n.ts`) |
| Paquets | npm (`package-lock.json`) ; `npm run dev` lance `next dev --webpack` |
| Nom | le site affiche « Kukan » ; restent « betwixt » dans `package.json` (`betwixt-landing`) et dans les clés de l'éditeur (`betwixt-vector-studio:recovery:v1`, extension `.betwixt.json`) |
| Hébergement | rien dans le dépôt (pas de `vercel.json`) ; Vercel d'après l'utilisateur |
| Landing | `app/page.js` + `components/Hero.js`, `ProblemSection.js`, `HowItWorks.js`, `Differentiator.js`, `PricingSection.js`, `FAQ.js`, `Footer.js`. **Il n'y a pas de `LandingPage.jsx`** dans ce dépôt |

## 2. Pages
- Publiques : `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/account-deactivated`.
- Intérieur : `/dashboard` (accueil Dockview, génération A → B par Replicate, crayon `DrawingCanvas`),
  `/dashboard/draw` (éditeur vectoriel `CanvasAnimationPro`), `/dashboard/inversion` (traits cachés : bouton
  qui affiche « non disponible »), `/dashboard/vectorize`, `/dashboard/profile`, `/dashboard/settings`,
  `/dashboard/billing` (aucun paiement : `TODO: branchement Stripe checkout`).
- Pas de projets, de travaux, de panneau « Calculs », de partage, de Realtime, de quotas GPU.

## 3. Supabase
- Client : `@supabase/supabase-js` seul (pas `@supabase/ssr`), `lib/supabaseClient.js` (clé publique).
  Les routes `app/api/*` vérifient le jeton envoyé dans l'en-tête `Authorization: Bearer …` (`auth.getUser`).
- Variables d'environnement (noms seulement) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SECRET_KEY` (serveur, webhook), `REPLICATE_API_TOKEN`, `NEXT_PUBLIC_SITE_URL`.
- Pas de dossier `supabase/migrations`, pas de types générés : le schéma exact (clés étrangères, RLS) reste à
  obtenir du tableau de bord.
- Tables et colonnes vues dans le code :
  | Table | Colonnes utilisées |
  |---|---|
  | `profiles` | `id` (= `auth.users.id`), `is_deactivated`, `avatar_icon`, lien vers `plans` (jointure `plans(*)`, nom de la colonne à confirmer) |
  | `plans` | `id`, `display_name`, `max_intermediates`, `monthly_generation_limit` |
  | `generations` | `id`, `user_id`, `status` (`pending` \| `processing` \| `completed` \| `failed`), `ref_image_url`, `tar_image_url`, `output_gif_url`, `replicate_prediction_id`, `created_at` |
  Le § 7 du cahier suppose `profiles.plan` : en réalité le plan est une **table** `plans` reliée au profil.
  `plan_limites` pourra devenir des colonnes de `plans` (à décider avec l'utilisateur).
- Stockage : buckets `generation-inputs` et `generation-outputs`, lus par **adresse publique** (`getPublicUrl`).

## 4. Appels externes
- `POST /api/generate` → **Replicate** (`ndj-create/kukan-inbetween`, ancien workflow). `POST /api/webhook` reçoit
  la réponse de Replicate **sans vérifier de signature** (n'importe qui peut marquer une génération terminée avec un
  GIF de son choix). `GET /api/status/[id]`, `DELETE /api/generations/[id]`.
- **Aucun appel à Modal.** Paquet `replicate` encore installé.
- À traiter (avec accord) : retirer la chaîne Replicate, passer les buckets en privé avec adresses signées.

## 5. Éditeurs (Fabric.js **7.4**, pas 6)
- `components/DrawingCanvas.js` (dans `/dashboard`) : crayon, toile carrée 512 px, export SVG un `<path>` par trait,
  **sans `id`**.
- `components/CanvasAnimationPro/*` (dans `/dashboard/draw`) : document à poses A et B, calques, « copier la pose »,
  annuler, récupération dans `localStorage`. `exportPipelinePair` impose le **même ordre** des traits dans A et B et
  garde les identifiants dans un manifeste à part ; le SVG n'a **ni `id` par trait ni `<g>` par calque** (contrat du
  § 4.1 du cahier pas encore tenu : appariement par ordre seulement).
- `components/InversionEditor.js` : crayon sur SVG chargé.
- `controlsUtils.createPathControls` (attendu en v6 au § 3.7) : à revérifier en v7.

## 6. i18n, charte, lecture
- i18n maison : `lib/i18n.js` (fr, en), `lib/studio-i18n.ts` ; langue dans `localStorage` (`kukan_lang`).
- Charte : Tailwind v4 ; `app/globals.css` définit la palette grise `--k-*` (`--k-chrome`, `--k-border`,
  `--k-text`…) ; polices Zen Old Mincho (titres), Inter (texte), IBM Plex Mono ; pas de thème sombre.
- Lecture des résultats : GIF dans une balise `<img>` (`components/ResultPanel.js`).

## 7. Écarts avec le cahier
- Le cahier date le dernier déploiement Modal à la version 18 (`f318073`) ; l'utilisateur indique la **v20**.
  Commit et liste des fonctions de la v20 à confirmer avant E1.
- Ordre de travail validé le 2026-10-30 : (1) ce rapport et `CLAUDE.md` ; (2) E1, route `app/api` qui appelle
  `kukan_verifier_svg` (CPU, 0 $) ; (3) Supabase, migrations montrées avant, test à deux comptes ; (4) écrans de
  l'intérieur ; (5) en parallèle, landing : GIF → WebP après choix des démonstrations. Le travail des textes de la
  landing est un chantier séparé, après l'intérieur.
