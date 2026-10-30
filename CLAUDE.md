# Kukan — frontend (Next.js 16 App Router, JS/TS, Tailwind v4, Supabase, Fabric 7)

À lire : `docs/etat_frontend.md` (état réel du dépôt), puis `docs/cahier_session_frontend.md` (référence produit et
moteur). Répondre en français, rapports courts, une étape à la fois.

- Une branche par tâche ; jamais de push sur `main` ; aperçu Vercel avant toute fusion.
- Jamais d'appel GPU Modal ni de déploiement sans accord explicite ; estimer avant, coût réel après.
- Supabase : rien créer ni modifier sans accord ; SQL montré avant, en fichiers `supabase/migrations`.
- Secrets : `.env.local` ou l'hébergeur seulement ; clé de service Supabase et jeton Modal côté serveur.
- Le navigateur n'appelle jamais Modal : routes `app/api/*` qui vérifient auth, plan et quota.
- Réutiliser la charte (`--k-*` de `app/globals.css`) et l'i18n maison (`lib/i18n.js`, fr/en).
- Aucune extension de design avant l'étape « écrans de l'intérieur » ; ne pas refaire la landing (chantier séparé).
- Ne changer aucun comportement visible sans le montrer d'abord. Vérifier : `npm run lint`, `npm run build`.
- Commits : `git -c user.name="NDJ-create" -c user.email="saisrien2@gmail.com" commit`.
