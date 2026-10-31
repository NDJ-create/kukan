-- Lot 0 (sécurité) : un utilisateur ne peut plus modifier son plan ni ses crédits.
--
-- Constat (export du 2026-10-31) :
--   - politique "Users can update own profile" : UPDATE, using (auth.uid() = id), sans with check
--     (with check reprend alors using : la ligne doit rester la sienne, rien de plus) ;
--   - droit UPDATE de authenticated sur toute la table profiles.
--   => un utilisateur connecté peut faire, depuis le navigateur :
--      supabase.from("profiles").update({ plan_id: "enterprise", credits: 999999 }).eq("id", sonId)
--
-- Correction : droits par colonne. authenticated ne garde UPDATE que sur les colonnes que
-- l'application modifie elle-même (avatar_icon, is_deactivated) et sur deux préférences d'affichage.
-- plan_id, credits, username, id, created_at ne sont plus modifiables que par le service (clé de service,
-- tableau de bord). is_deactivated reste modifiable : c'est la désactivation volontaire du compte par
-- l'utilisateur (app/dashboard/settings, app/account-deactivated), pas une sanction.
--
-- À relire, puis à exécuter dans le SQL Editor, seulement avec l'accord de l'utilisateur.

begin;

-- 1. Droits par colonne sur profiles
revoke update on table public.profiles from authenticated, anon;
grant update (avatar_icon, is_deactivated, hide_inversion_example, dismissed_desktop_notice)
  on table public.profiles to authenticated;

-- 2. Politique de mise à jour : réservée aux connectés, with check explicite
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3. Hygiène : TRUNCATE ignore les règles RLS ; aucun rôle public n'en a besoin
--    (l'API REST ne l'expose pas, mais le droit ne doit pas exister).
revoke truncate on table public.profiles, public.plans, public.generations, public.animation_leads
  from anon, authenticated;

commit;
