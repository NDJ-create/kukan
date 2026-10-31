-- Test à deux comptes du lot 0, à lancer dans le SQL Editor APRÈS la migration.
-- Rien n'est enregistré : chaque essai tourne dans une transaction annulée (rollback).
--
-- Avant : remplacer UUID_A et UUID_B par les identifiants de deux comptes de test
-- (Authentication > Users : colonne UID ; ce ne sont pas des secrets).
-- A = compte Free, B = compte Studio (ou un autre compte).
--
-- Lancer les blocs UN PAR UN et noter le résultat de chacun.

-- 0. État de départ (lecture seule) : personne n'a déjà changé son plan ?
select plan_id, count(*) as comptes, min(credits) as credits_min, max(credits) as credits_max
from public.profiles group by plan_id order by plan_id;

-- 1. A essaie de passer en enterprise. Attendu : ERREUR 42501 "permission denied for table profiles".
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.profiles set plan_id = 'enterprise' where id = 'UUID_A';
rollback;

-- 2. A essaie de changer ses crédits. Attendu : ERREUR 42501.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.profiles set credits = 999999 where id = 'UUID_A';
rollback;

-- 3. A change son avatar. Attendu : 1 ligne renvoyée (permis).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.profiles set avatar_icon = 'test' where id = 'UUID_A' returning id, avatar_icon;
rollback;

-- 4. A essaie de changer l'avatar de B. Attendu : 0 ligne (RLS), aucune erreur.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.profiles set avatar_icon = 'test' where id = 'UUID_B' returning id;
rollback;

-- 5. A désactive puis réactive son compte. Attendu : 1 ligne à chaque fois (permis).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.profiles set is_deactivated = true where id = 'UUID_A' returning is_deactivated;
update public.profiles set is_deactivated = false where id = 'UUID_A' returning is_deactivated;
rollback;

-- 6. A essaie de prendre l'identifiant de B. Attendu : ERREUR 42501.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.profiles set id = 'UUID_B' where id = 'UUID_A';
rollback;

-- 7. B (Studio) : mêmes droits que A sur sa propre ligne. Attendu : ERREUR 42501.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_B', 'role', 'authenticated')::text, true);
update public.profiles set plan_id = 'enterprise' where id = 'UUID_B';
rollback;

-- 8. Le service (rôle du SQL Editor) peut toujours changer un plan. Attendu : 1 ligne.
begin;
update public.profiles set plan_id = 'studio' where id = 'UUID_A' returning id, plan_id;
rollback;

-- 9. Droits restants de authenticated sur profiles. Attendu : UPDATE seulement sur
--    avatar_icon, dismissed_desktop_notice, hide_inversion_example, is_deactivated.
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon', 'authenticated')
  and privilege_type = 'UPDATE'
order by grantee, column_name;

-- Ensuite, dans l'application (aperçu ou kukan.pro) avec le compte A :
--   changer d'avatar (Profil) ; désactiver le compte (Réglages) puis le réactiver. Les deux doivent marcher.
