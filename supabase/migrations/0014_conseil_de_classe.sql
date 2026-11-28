-- Luqmân Campus — étape 5 : conseil de classe (mode deux écrans).
-- Un conseil = une classe × une période. L'animateur (direction ou professeur principal) pilote depuis son appareil ;
-- l'écran projeté (autre appareil ou autre fenêtre) suit en direct grâce à Supabase Realtime (et à une relecture
-- régulière si le temps réel n'est pas disponible). L'écran projeté n'affiche jamais les remarques internes.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite.

create table public.conseils (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  periode_id uuid not null references public.periodes(id) on delete cascade,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'termine')),
  vue text not null default 'classe' check (vue in ('accueil', 'classe', 'eleve', 'synthese')),
  eleve_id uuid references public.eleves(id) on delete set null,
  -- Ce que montre l'écran projeté : rang, absences, appréciations des matières.
  options jsonb not null default '{"rang": false, "absences": true, "appreciations": true}'::jsonb,
  revision integer not null default 0,
  debut timestamptz not null default now(),
  fin timestamptz,
  anime_par uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classe_id, periode_id)
);
-- Suivi élève par élève pendant le conseil (compte rendu interne : jamais projeté, jamais imprimé sur le bulletin).
create table public.conseil_eleves (
  conseil_id uuid not null references public.conseils(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  traite boolean not null default false,
  a_revoir boolean not null default false,
  remarque text check (remarque is null or length(remarque) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conseil_id, eleve_id)
);
create trigger horodater_conseils before insert or update on public.conseils for each row execute function public.horodater();
create trigger horodater_conseil_eleves before insert or update on public.conseil_eleves for each row execute function public.horodater();
create trigger auditer_conseils after insert or update or delete on public.conseils for each row execute function public.auditer();
create trigger auditer_conseil_eleves after insert or update or delete on public.conseil_eleves for each row execute function public.auditer();

-- Animer = direction ou professeur principal de la classe (plus strict que la lecture des notes).
create function public.peut_animer_conseil(p_classe uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin() or exists (select 1 from public.classes c where c.id = p_classe and c.prof_principal_id = auth.uid());
end $$;

alter table public.conseils enable row level security;
alter table public.conseil_eleves enable row level security;
create policy conseils_lecture on public.conseils for select using (public.voit_toute_la_classe(classe_id));
create policy conseil_eleves_lecture on public.conseil_eleves for select
  using (exists (select 1 from public.conseils c where c.id = conseil_id and public.voit_toute_la_classe(c.classe_id)));
-- Écriture uniquement par les fonctions ci-dessous (contrôles explicites).
revoke all on public.conseils, public.conseil_eleves from anon, authenticated;
grant select on public.conseils, public.conseil_eleves to authenticated;

-- ---------- Ouvrir (ou reprendre) le conseil d'une classe pour une période ----------
create function public.ouvrir_conseil(p_classe uuid, p_periode uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not public.peut_animer_conseil(p_classe) then
    raise exception 'Le conseil de classe est animé par la direction ou le professeur principal.';
  end if;
  if not exists (select 1 from classes cl join periodes p on p.annee_id = cl.annee_id where cl.id = p_classe and p.id = p_periode) then
    raise exception 'Classe ou période introuvable (la période doit être de l''année de la classe).';
  end if;
  select id into cid from conseils where classe_id = p_classe and periode_id = p_periode;
  if cid is null then
    insert into conseils(classe_id, periode_id) values (p_classe, p_periode) returning id into cid;
  end if;
  return cid;
end $$;

-- ---------- Piloter : ce que montre l'écran projeté, élève en cours, options, fin du conseil ----------
-- p_changements : {"vue":"eleve","eleve_id":"…","statut":"termine","options":{"rang":true}} — clés facultatives.
-- Chaque appel augmente « revision » : l'écran projeté sait qu'il doit se rafraîchir (aussi après une saisie d'appréciation).
create function public.piloter_conseil(p_conseil uuid, p_changements jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.conseils; j jsonb := coalesce(p_changements, '{}'::jsonb); el uuid;
begin
  select * into c from conseils where id = p_conseil;
  if c.id is null then raise exception 'Conseil introuvable'; end if;
  if not public.peut_animer_conseil(c.classe_id) then
    raise exception 'Le conseil de classe est animé par la direction ou le professeur principal.';
  end if;
  if j ? 'eleve_id' then
    el := nullif(j->>'eleve_id', '')::uuid;
    if el is not null and not exists (select 1 from eleves where id = el and classe_id = c.classe_id and deleted_at is null) then
      raise exception 'Cet élève n''est pas dans la classe.';
    end if;
    c.eleve_id := el;
  end if;
  if j ? 'vue' then c.vue := j->>'vue'; end if;
  if j ? 'options' then c.options := c.options || (j->'options'); end if;
  if j ? 'statut' then
    c.statut := j->>'statut';
    c.fin := case when c.statut = 'termine' then now() else null end;
  end if;
  update conseils set vue = c.vue, eleve_id = c.eleve_id, options = c.options, statut = c.statut, fin = c.fin, revision = revision + 1
   where id = p_conseil returning * into c;
  return to_jsonb(c);
end $$;

-- ---------- Suivi d'un élève pendant le conseil (traité, à revoir, remarque interne) ----------
-- Paramètre null = inchangé ; remarque '' = effacée.
create function public.noter_conseil_eleve(p_conseil uuid, p_eleve uuid, p_traite boolean default null, p_a_revoir boolean default null, p_remarque text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.conseils;
begin
  select * into c from conseils where id = p_conseil;
  if c.id is null then raise exception 'Conseil introuvable'; end if;
  if not public.peut_animer_conseil(c.classe_id) then
    raise exception 'Le conseil de classe est animé par la direction ou le professeur principal.';
  end if;
  if not exists (select 1 from eleves where id = p_eleve and classe_id = c.classe_id) then
    raise exception 'Cet élève n''est pas dans la classe.';
  end if;
  if p_remarque is not null and length(p_remarque) > 1000 then raise exception 'Remarque trop longue (1000 caractères au plus).'; end if;
  insert into conseil_eleves(conseil_id, eleve_id, traite, a_revoir, remarque)
  values (p_conseil, p_eleve, coalesce(p_traite, false), coalesce(p_a_revoir, false), nullif(btrim(coalesce(p_remarque, '')), ''))
  on conflict (conseil_id, eleve_id) do update set
    traite = coalesce(p_traite, conseil_eleves.traite),
    a_revoir = coalesce(p_a_revoir, conseil_eleves.a_revoir),
    remarque = case when p_remarque is null then conseil_eleves.remarque else nullif(btrim(p_remarque), '') end;
  update conseils set revision = revision + 1 where id = p_conseil;
end $$;

revoke all on function public.peut_animer_conseil(uuid), public.ouvrir_conseil(uuid, uuid), public.piloter_conseil(uuid, jsonb),
  public.noter_conseil_eleve(uuid, uuid, boolean, boolean, text) from public, anon;
grant execute on function public.peut_animer_conseil(uuid), public.ouvrir_conseil(uuid, uuid), public.piloter_conseil(uuid, jsonb),
  public.noter_conseil_eleve(uuid, uuid, boolean, boolean, text) to authenticated;

-- ---------- Temps réel : l'écran projeté reçoit chaque changement du conseil ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.conseils, public.conseil_eleves;
  end if;
end $$;
