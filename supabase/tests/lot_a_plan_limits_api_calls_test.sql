-- Test à deux comptes du lot A, à lancer dans le SQL Editor APRÈS la migration.
-- Chaque essai tourne dans une transaction annulée (rollback) : aucun compteur n'est gardé.
--
-- Avant :
--   - créer un second compte (inscription normale sur kukan.pro avec une autre adresse e-mail) ;
--   - noter les deux UID (Authentication > Users) : UUID_A (compte actuel, free), UUID_B (nouveau compte) ;
--   - remplacer UUID_A et UUID_B ci-dessous.
-- Lancer les blocs UN PAR UN et noter le résultat de chacun.

-- 1. Limites lues dans plans (tout le monde, comme aujourd'hui). Attendu : 4 lignes, valeurs du lot A.
select id, verify_svg_daily_limit, concurrent_jobs, max_queued_jobs, concurrent_gpu_passes, gpu_call_timeout_s,
       max_cost_per_job_cents, gpu_seconds_monthly, max_poses_per_job, max_animated_layers, sharing_enabled
from public.plans order by price_cents, id;

-- 2. A prend 3 appels avec un maximum de 2. Attendu : true / true / false (retry_after_s > 0, used = 2).
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select * from public.take_api_call('test', 2, 3600);
select * from public.take_api_call('test', 2, 3600);
select * from public.take_api_call('test', 2, 3600);
-- 3. B, même route, même fenêtre, dans la même transaction. Attendu : true, used = 1 (compteurs séparés).
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_B', 'role', 'authenticated')::text, true);
select * from public.take_api_call('test', 2, 3600);
rollback;

-- 4. A essaie de lire ou de modifier api_calls directement. Attendu : ERREUR 42501 à chaque requête
--    (lancer les trois lignes une par une, chacune dans sa transaction).
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
insert into public.api_calls (user_id, route, window_start, call_count) values ('UUID_A', 'test', now(), 0);
rollback;

-- 5. A essaie de relever son quota dans plans. Attendu : ERREUR 42501.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
update public.plans set verify_svg_daily_limit = 999999 where id = 'free';
rollback;

-- 6. Visiteur non connecté (anon) : la fonction lui est fermée. Attendu : ERREUR 42501.
begin;
set local role anon;
select * from public.take_api_call('test', 2, 3600);
rollback;

-- 7. Rôle authenticated sans utilisateur (jeton absent). Attendu : ERREUR « utilisateur non connecté ».
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select * from public.take_api_call('test', 2, 3600);
rollback;

-- 8. Maximum 0 (plan sans droit). Attendu : false, used = 0, rien n'est compté.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'UUID_A', 'role', 'authenticated')::text, true);
select * from public.take_api_call('test', 0, 60);
rollback;

-- 9. Droits réels. Attendu : api_calls false partout pour anon, authenticated, service_role ;
--    take_api_call : execute true pour authenticated seulement.
select p.droit,
       has_table_privilege('anon', 'public.api_calls', p.droit) as anon,
       has_table_privilege('authenticated', 'public.api_calls', p.droit) as authenticated,
       has_table_privilege('service_role', 'public.api_calls', p.droit) as service_role
from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(droit);

select r.rolname,
       has_function_privilege(r.rolname, 'public.take_api_call(text, integer, integer)', 'EXECUTE') as execute
from (values ('anon'), ('authenticated'), ('service_role')) r(rolname);

-- 10. Après les essais : la table doit être vide (tout a été annulé). Attendu : 0.
select count(*) from public.api_calls;
