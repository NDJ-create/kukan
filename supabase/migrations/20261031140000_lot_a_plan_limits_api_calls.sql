-- Lot A : limites par plan (colonnes de plans), compteur d'appels (api_calls) et fonction take_api_call.
--
-- Décisions (2026-10-31) : noms en anglais comme l'existant ; limites en colonnes de plans (une seule source),
-- identifiants existants free, independent, studio, enterprise ; quotas de verifier provisoires.
-- Valeurs GPU et travaux : propositions des § 3.3, 3.9 et 3.10 du cahier, provisoires (choix 1 du § 9.3).
-- null = pas de limite propre au plan (contrat) ; les plafonds de sécurité de Modal s'appliquent toujours.
-- generations et les buckets generation-* ne sont pas touchés (décision Replicate en attente).
--
-- À relire, puis à exécuter dans le SQL Editor, seulement avec l'accord de l'utilisateur.

begin;

-- 1. Limites par plan ---------------------------------------------------------------------------

do $$
begin
  if (select count(*) from public.plans where id in ('free', 'independent', 'studio', 'enterprise')) <> 4 then
    raise exception 'plans : les 4 identifiants free, independent, studio, enterprise sont attendus';
  end if;
end $$;

alter table public.plans
  add column verify_svg_daily_limit integer not null default 50 check (verify_svg_daily_limit >= 0),
  add column concurrent_jobs integer check (concurrent_jobs >= 0),
  add column max_queued_jobs integer check (max_queued_jobs >= 0),
  add column concurrent_gpu_passes integer check (concurrent_gpu_passes >= 0),
  add column gpu_call_timeout_s integer check (gpu_call_timeout_s between 1 and 900),
  add column max_cost_per_job_cents integer check (max_cost_per_job_cents >= 0),
  add column gpu_seconds_monthly integer check (gpu_seconds_monthly >= 0),
  add column max_poses_per_job integer check (max_poses_per_job >= 2),
  add column max_animated_layers integer check (max_animated_layers >= 1),
  add column sharing_enabled boolean not null default false;

comment on column public.plans.verify_svg_daily_limit is 'Vérifications de SVG (/api/svg/verifier) par jour UTC.';
comment on column public.plans.concurrent_jobs is 'Générations en cours en même temps ; null = contrat.';
comment on column public.plans.max_queued_jobs is 'Générations en file au plus ; null = contrat.';
comment on column public.plans.concurrent_gpu_passes is 'Passages GPU simultanés (jetons pris par Modal).';
comment on column public.plans.gpu_call_timeout_s is 'Coupure d''un appel GPU côté client, en secondes (Modal reste à 900 s).';
comment on column public.plans.max_cost_per_job_cents is 'Plafond de coût par génération, au pire, en cents de dollar ; null = contrat.';
comment on column public.plans.gpu_seconds_monthly is 'Secondes de GPU par mois ; null = contrat.';
comment on column public.plans.max_poses_per_job is 'Poses par génération ; null = contrat.';
comment on column public.plans.max_animated_layers is 'Calques animés par génération ; null = contrat.';
comment on column public.plans.sharing_enabled is 'Partage de projets permis (Studio, Enterprise).';

update public.plans set
  verify_svg_daily_limit = 50, concurrent_jobs = 1, max_queued_jobs = 2, concurrent_gpu_passes = 1,
  gpu_call_timeout_s = 500, max_cost_per_job_cents = 50, gpu_seconds_monthly = 900,
  max_poses_per_job = 2, max_animated_layers = 1, sharing_enabled = false
where id = 'free';

update public.plans set
  verify_svg_daily_limit = 300, concurrent_jobs = 2, max_queued_jobs = 5, concurrent_gpu_passes = 1,
  gpu_call_timeout_s = 900, max_cost_per_job_cents = 100, gpu_seconds_monthly = 3600,
  max_poses_per_job = 4, max_animated_layers = 3, sharing_enabled = false
where id = 'independent';

update public.plans set
  verify_svg_daily_limit = 2000, concurrent_jobs = 4, max_queued_jobs = 20, concurrent_gpu_passes = 3,
  gpu_call_timeout_s = 900, max_cost_per_job_cents = 300, gpu_seconds_monthly = 14400,
  max_poses_per_job = 8, max_animated_layers = 12, sharing_enabled = true
where id = 'studio';

update public.plans set
  verify_svg_daily_limit = 2000, concurrent_jobs = 12, max_queued_jobs = null, concurrent_gpu_passes = 8,
  gpu_call_timeout_s = 900, max_cost_per_job_cents = null, gpu_seconds_monthly = null,
  max_poses_per_job = null, max_animated_layers = null, sharing_enabled = true
where id = 'enterprise';

-- 2. Compteur d'appels par utilisateur, route et durée de fenêtre ---------------------------

create table public.api_calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  route text not null check (length(route) between 1 and 64),
  window_seconds integer not null check (window_seconds > 0),
  window_start timestamptz not null,
  call_count integer not null default 0 check (call_count >= 0),
  primary key (user_id, route, window_seconds, window_start)
);

comment on table public.api_calls is 'Compteur d''appels par utilisateur, route et fenêtre ; écrit seulement par take_api_call.';

alter table public.api_calls enable row level security;
-- Aucune politique : aucun accès direct. Seule la fonction take_api_call (security definer) y écrit.
revoke all on table public.api_calls from public, anon, authenticated, service_role;

-- 3. Prise atomique d'un appel ---------------------------------------------------------------
-- Fenêtre fixe alignée sur l'époque Unix (jour = jour UTC). Compte l'appel de auth.uid() s'il reste de la
-- place, sinon refuse sans compter.
-- Seuls les couples route / durée prévus sont acceptés : un utilisateur qui appelle la fonction lui-même
-- (rpc avec la clé publique) ne peut ni créer d'autres compteurs ni toucher ceux d'une autre durée.
-- Le maximum est donné par la route (lu dans plans côté serveur) : appeler la fonction soi-même ne fait que
-- consommer son propre quota.

create function public.take_api_call(p_route text, p_max integer, p_window_seconds integer)
returns table (allowed boolean, used integer, retry_after_s integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_user is null then
    raise exception 'take_api_call : utilisateur non connecté' using errcode = '42501';
  end if;
  if (p_route, p_window_seconds) is distinct from ('verify_svg:minute', 60)
     and (p_route, p_window_seconds) is distinct from ('verify_svg:day', 86400) then
    raise exception 'take_api_call : couple route / durée non prévu' using errcode = '22023';
  end if;
  if p_max is null or p_max < 0 then
    raise exception 'take_api_call : maximum invalide' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  if p_max > 0 then
    insert into public.api_calls as c (user_id, route, window_seconds, window_start, call_count)
    values (v_user, p_route, p_window_seconds, v_window, 1)
    on conflict (user_id, route, window_seconds, window_start)
    do update set call_count = c.call_count + 1
    where c.call_count < p_max
    returning c.call_count into v_count;
  end if;

  if v_count is null then
    select c.call_count into v_count
    from public.api_calls c
    where c.user_id = v_user and c.route = p_route and c.window_seconds = p_window_seconds
      and c.window_start = v_window;

    return query select
      false,
      coalesce(v_count, 0),
      greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now()))))::integer;
    return;
  end if;

  -- Ménage : fenêtres terminées de cet utilisateur, pour cette route ET cette durée seulement.
  delete from public.api_calls c
  where c.user_id = v_user and c.route = p_route and c.window_seconds = p_window_seconds
    and c.window_start < v_window;

  return query select true, v_count, 0;
end;
$$;

revoke all on function public.take_api_call(text, integer, integer) from public, anon, service_role;
grant execute on function public.take_api_call(text, integer, integer) to authenticated;

-- 4. Droits de service_role ------------------------------------------------------------------
-- Rien à donner dans ce lot : aucune route ni Modal n'utilise la clé de service sur plans, profiles ou
-- api_calls (la route E1 agit avec le jeton de l'utilisateur ; take_api_call écrit avec les droits de son
-- propriétaire). Les droits de service_role seront donnés table par table avec les lots qui en ont besoin
-- (lot D : travaux, événements, artefacts). generations : avec la décision Replicate.

commit;
