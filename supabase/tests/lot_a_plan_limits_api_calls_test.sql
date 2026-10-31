-- Test à deux comptes du lot A, à lancer dans le SQL Editor APRÈS la migration.
-- Chaque essai tourne dans une transaction annulée (rollback) : aucun compteur n'est gardé.
--
-- Avant :
--   - créer un second compte (inscription normale sur kukan.pro avec une autre adresse e-mail) ;
--   - noter les deux UID (Authentication > Users) : UUID_A (compte actuel, free), UUID_B (nouveau compte) ;
--   - remplacer UUID_A et UUID_B ci-dessous.
-- Lancer les blocs UN PAR UN et noter le résultat de chacun.
-- take_api_call n'accepte que verify_svg:minute / 60 et verify_svg:day / 86400 : les essais utilisent la route
-- du jour avec un petit maximum (2), pour ne pas dépendre d'un changement de minute pendant le test.

-- 1. Limites lues dans plans (tout le monde, comme aujourd'hui). Attendu : 4 lignes, valeurs du lot A.
select id, verify_svg_daily_limit, concurrent_jobs, max_queued_jobs, concurrent_gpu_passes, gpu_call_timeout_s,
       max_cost_per_job_cents, gpu_seconds_monthly, max_poses_per_job, max_animated_layers, sharing_enabled
from public.plans order by price_cents, id;

-- 2. A prend 3 appels avec un maximum de 2. Attendu : t / 1, t / 2, puis f / 2 (retry_after_s > 0).
-- 3. B, même route, même fenêtre, dans la même transaction. Attendu : t / 1 (compteurs séparés).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select * from public.take_api_call('verify_svg:day', 2, 86400);
select * from public.take_api_call('verify_svg:day', 2, 86400);
select * from public.take_api_call('verify_svg:day', 2, 86400);
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_B', 'role', 'authenticated')::text, true);
select * from public.take_api_call('verify_svg:day', 2, 86400);
rollback;

-- 4. Attaque « remise à zéro » : A consomme son quota du jour (2 appels), essaie de faire effacer son
--    compteur avec une fenêtre de 1 s sur la même route, puis appelle à nouveau.
--    Attendu : t / 1, t / 2 ; NOTICE « attaque refusée : ... couple route / durée non prévu » ;
--    puis t / 1 (route minute, compteur séparé) ; puis f / 2 (le quota du jour n'est PAS remis à zéro) ;
--    compteurs de A : 2 lignes, verify_svg:day / 86400 / 2 et verify_svg:minute / 60 / 1.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select * from public.take_api_call('verify_svg:day', 2, 86400);
select * from public.take_api_call('verify_svg:day', 2, 86400);
do $$
begin
  perform public.take_api_call('verify_svg:day', 1, 1);
  raise notice 'attaque ACCEPTÉE (défaut)';
exception when others then
  raise notice 'attaque refusée : %', sqlerrm;
end $$;
select * from public.take_api_call('verify_svg:minute', 1, 60);
select * from public.take_api_call('verify_svg:day', 2, 86400);
reset role;
select route, window_seconds, call_count from public.api_calls
where user_id = 'UUID_A' order by route;
rollback;

-- 5. Couples non prévus. Attendu : 3 NOTICE « refusé : ... couple route / durée non prévu ».
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
do $$
declare
  couple record;
begin
  for couple in select * from (values ('test', 3600), ('verify_svg:day', 60), ('verify_svg:minute', 86400)) v(route, secs) loop
    begin
      perform public.take_api_call(couple.route, 2, couple.secs);
      raise notice 'ACCEPTÉ (défaut) : % / %', couple.route, couple.secs;
    exception when others then
      raise notice 'refusé : % / % : %', couple.route, couple.secs, sqlerrm;
    end;
  end loop;
end $$;
rollback;

-- 6. A essaie de lire ou de modifier api_calls directement. Attendu : ERREUR 42501 à chaque requête
--    (lancer les trois transactions une par une).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select * from public.api_calls;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
delete from public.api_calls;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
insert into public.api_calls (user_id, route, window_seconds, window_start, call_count)
values ('UUID_A', 'verify_svg:day', 86400, now(), 0);
rollback;

-- 7. A essaie de relever son quota dans plans. Attendu : ERREUR 42501.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.plans set verify_svg_daily_limit = 999999 where id = 'free';
rollback;

-- 8. Visiteur non connecté (anon) : la fonction lui est fermée. Attendu : ERREUR 42501.
begin;
set local role anon;
select * from public.take_api_call('verify_svg:day', 2, 86400);
rollback;

-- 9. Rôle authenticated sans utilisateur (jeton absent). Attendu : ERREUR « utilisateur non connecté ».
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select * from public.take_api_call('verify_svg:day', 2, 86400);
rollback;

-- 10. Maximum 0 (plan sans droit). Attendu : f / 0, retry_after_s ≤ 60, rien n'est compté.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select * from public.take_api_call('verify_svg:minute', 0, 60);
rollback;

-- 11. Droits réels. Attendu : api_calls f partout pour anon, authenticated, service_role ;
--     take_api_call : execute t pour authenticated seulement.
select p.droit,
       has_table_privilege('anon', 'public.api_calls', p.droit) as anon,
       has_table_privilege('authenticated', 'public.api_calls', p.droit) as authenticated,
       has_table_privilege('service_role', 'public.api_calls', p.droit) as service_role
from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(droit);

select r.rolname,
       has_function_privilege(r.rolname, 'public.take_api_call(text, integer, integer)', 'EXECUTE') as execute
from (values ('anon'), ('authenticated'), ('service_role')) r(rolname);

-- 12. Après les essais : la table doit être vide (tout a été annulé). Attendu : 0.
select count(*) from public.api_calls;
