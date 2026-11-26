-- Luqmân Campus — étape 2 : vie scolaire du quotidien
-- Cours, appel, présences (retards, sorties, dispenses), observations, punitions, coffre à téléphones.
-- Toutes les heures sont celles du SERVEUR : l'heure envoyée par le navigateur est ignorée.
-- Données fictives uniquement tant que l'étape 0b (déploiement) n'est pas faite.

create type public.statut_presence as enum ('present','absent','retard','sortie','dispense');
create type public.type_observation as enum ('travail','comportement','oubli','telephone','felicitation','autre');

-- ---------- Fonctions de droits ----------
-- Vie scolaire, direction et administration.
create function public.est_vie_scolaire() returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_un_role(array['administrateur','direction','vie_scolaire']::public.role_app[])
$$;

-- Peut faire l'appel d'un cours : la vie scolaire, ou le professeur qui enseigne ce cours.
create function public.peut_appeler(p_cours uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_vie_scolaire()
      or (public.a_un_role(array['professeur','professeur_principal']::public.role_app[])
          and exists (select 1 from public.cours c join public.enseignements e on e.id = c.enseignement_id
                      where c.id = p_cours and e.professeur_id = auth.uid()));
end $$;

-- ---------- Tables ----------
create table public.cours (
  id uuid primary key default gen_random_uuid(),
  enseignement_id uuid not null references public.enseignements(id) on delete cascade,
  debut timestamptz not null,
  fin timestamptz not null,
  salle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > debut)
);
create index cours_debut on public.cours (debut);

-- Un appel par cours ; il est créé à l'ouverture et validé par le professeur.
create table public.appels (
  id uuid primary key default gen_random_uuid(),
  cours_id uuid not null unique references public.cours(id) on delete cascade,
  ouvert_par uuid references public.profils(id),
  ouvert_a timestamptz not null default now(),
  valide_par uuid references public.profils(id),
  valide_a timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.presences (
  id uuid primary key default gen_random_uuid(),
  cours_id uuid not null references public.cours(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id),
  statut public.statut_presence not null default 'present',
  heure_evenement timestamptz,        -- heure serveur du changement de statut (retard, sortie, absence...)
  minutes_retard smallint,            -- arrondi au palier supérieur (réglage retard_palier_min)
  autorise_par text,                  -- sortie anticipée : qui l'a autorisée
  recupere_par text,                  -- sortie anticipée : qui est venu chercher l'élève
  justifiee boolean not null default false,
  motif text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cours_id, eleve_id)
);
create index presences_eleve on public.presences (eleve_id);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id),
  cours_id uuid references public.cours(id) on delete set null,
  auteur_id uuid references public.profils(id),      -- rempli par le serveur, non falsifiable
  type public.type_observation not null default 'autre',
  texte text not null check (length(btrim(texte)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index observations_eleve on public.observations (eleve_id);

create table public.punitions (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id),
  auteur_id uuid references public.profils(id),      -- rempli par le serveur
  nature text not null default 'punition' check (nature in ('punition','sanction')),
  type text not null,                                -- ex. retenue, devoir supplémentaire, avertissement
  motif text not null check (length(btrim(motif)) > 0),
  duree_heures numeric(4,1) check (duree_heures > 0),   -- nombre d'heures (retenue)
  echeance date,
  statut text not null default 'a_faire' check (statut in ('a_faire','faite','annulee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index punitions_eleve on public.punitions (eleve_id);

create table public.coffre_telephone (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id),
  jour date not null default current_date,
  casier text,
  depose_a timestamptz,
  restitue_a timestamptz,
  non_depose boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, jour)
);

-- ---------- Heure serveur, auteur non falsifiable, calcul des retards ----------
create function public.presence_calcul() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_debut timestamptz; palier int;
begin
  if tg_op = 'UPDATE' and new.statut is not distinct from old.statut then
    new.heure_evenement := old.heure_evenement;      -- le client ne peut pas changer l'heure
    new.minutes_retard := old.minutes_retard;
    return new;
  end if;
  if new.statut = 'present' then
    new.heure_evenement := null; new.minutes_retard := null;
    new.autorise_par := null; new.recupere_par := null;
  else
    new.heure_evenement := now();
    if new.statut = 'retard' then
      select debut into v_debut from cours where id = new.cours_id;
      select (valeur #>> '{}')::int into palier from parametres where cle = 'retard_palier_min';
      palier := coalesce(palier, 5);
      new.minutes_retard := greatest(palier,
        (ceil(greatest(extract(epoch from now() - v_debut) / 60, 0) / palier) * palier)::int);
    else
      new.minutes_retard := null;
    end if;
    if new.statut <> 'sortie' then new.autorise_par := null; new.recupere_par := null; end if;
  end if;
  return new;
end $$;
create trigger presence_calcul before insert or update on public.presences
  for each row execute function public.presence_calcul();

create function public.forcer_auteur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.auteur_id := auth.uid();
  else new.auteur_id := old.auteur_id; end if;
  return new;
end $$;
create trigger forcer_auteur_observations before insert or update on public.observations
  for each row execute function public.forcer_auteur();
create trigger forcer_auteur_punitions before insert or update on public.punitions
  for each row execute function public.forcer_auteur();

-- Horodatage (created_at / updated_at) et journal d'audit sur chaque table
do $$
declare t text;
begin
  foreach t in array array['cours','appels','presences','observations','punitions','coffre_telephone'] loop
    execute format('create trigger horodater_%1$s before insert or update on public.%1$s
                    for each row execute function public.horodater()', t);
    execute format('create trigger auditer_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.auditer()', t);
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;

-- ---------- Droits (RLS) ----------
create policy cours_lecture on public.cours for select using (public.est_personnel());
create policy cours_ecriture on public.cours for all using (public.est_admin()) with check (public.est_admin());

create policy appels_lecture on public.appels for select using (public.est_personnel());   -- écriture : fonctions seulement

create policy presences_lecture on public.presences for select using (
  public.est_personnel()
  or exists (select 1 from public.eleves e where e.id = eleve_id and e.profil_id = auth.uid()));
create policy presences_ecriture on public.presences for all
  using (public.peut_appeler(cours_id)) with check (public.peut_appeler(cours_id));

create policy observations_lecture on public.observations for select using (public.est_personnel());
create policy observations_ajout on public.observations for insert with check (public.est_personnel());
create policy observations_modif on public.observations for update
  using (auteur_id = auth.uid() or public.est_admin()) with check (auteur_id = auth.uid() or public.est_admin());
create policy observations_suppr on public.observations for delete using (public.est_admin());

create policy punitions_lecture on public.punitions for select using (public.est_personnel());
create policy punitions_ajout on public.punitions for insert with check (public.est_personnel());
create policy punitions_modif on public.punitions for update
  using (auteur_id = auth.uid() or public.est_vie_scolaire()) with check (auteur_id = auth.uid() or public.est_vie_scolaire());
create policy punitions_suppr on public.punitions for delete using (public.est_admin());

create policy coffre_lecture on public.coffre_telephone for select using (public.est_vie_scolaire());   -- écriture : fonctions seulement

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.cours, public.presences, public.observations, public.punitions to authenticated;
grant select on public.appels, public.coffre_telephone to authenticated;

-- ---------- Appel ----------
-- Ouvre l'appel d'un cours : tous les élèves de la classe sont « présents » par défaut.
create function public.ouvrir_appel(p_cours uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  if not public.peut_appeler(p_cours) then raise exception 'Vous ne pouvez pas faire l''appel de ce cours'; end if;
  insert into appels (cours_id, ouvert_par) values (p_cours, auth.uid()) on conflict (cours_id) do nothing;
  insert into presences (cours_id, eleve_id)
    select p_cours, el.id
    from cours c join enseignements en on en.id = c.enseignement_id
         join eleves el on el.classe_id = en.classe_id and el.deleted_at is null
    where c.id = p_cours
    on conflict (cours_id, eleve_id) do nothing;
  select count(*) into nb from presences where cours_id = p_cours;
  return nb;
end $$;

-- Valide l'appel : heure serveur, plus de modification sans trace.
create function public.valider_appel(p_cours uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.peut_appeler(p_cours) then raise exception 'Vous ne pouvez pas valider l''appel de ce cours'; end if;
  perform public.ouvrir_appel(p_cours);
  update appels set valide_par = auth.uid(), valide_a = now() where cours_id = p_cours and valide_a is null;
  select jsonb_build_object(
      'valide_a', (select valide_a from appels where cours_id = p_cours),
      'presents', count(*) filter (where statut = 'present'),
      'absents', count(*) filter (where statut = 'absent'),
      'retards', count(*) filter (where statut = 'retard'),
      'sorties', count(*) filter (where statut = 'sortie'),
      'dispenses', count(*) filter (where statut = 'dispense'))
    into r from presences where cours_id = p_cours;
  return r;
end $$;

-- Appels non validés : notification au professeur après appel_delai_min, puis alerte vie scolaire
-- appel_alerte_vs_min plus tard. (Les notifications push viendront plus tard ; l'écran « Suivi du jour » les affiche.)
create function public.appels_manquants()
returns table (cours_id uuid, debut timestamptz, classe text, matiere text, professeur_id uuid, minutes_ecoulees int, niveau text)
language sql stable security definer set search_path = public as $$
  with p as (
    select coalesce((select (valeur #>> '{}')::int from parametres where cle = 'appel_delai_min'), 30) as delai,
           coalesce((select (valeur #>> '{}')::int from parametres where cle = 'appel_alerte_vs_min'), 15) as alerte)
  select c.id, c.debut, cl.nom, m.nom, en.professeur_id,
         (extract(epoch from now() - c.debut) / 60)::int,
         case when now() - c.debut >= make_interval(mins => p.delai + p.alerte) then 'vie_scolaire' else 'professeur' end
  from p, cours c
       join enseignements en on en.id = c.enseignement_id
       join classes cl on cl.id = en.classe_id
       join matieres m on m.id = en.matiere_id
       left join appels a on a.cours_id = c.id
  where c.debut <= now() - make_interval(mins => p.delai)
    and c.debut > now() - interval '1 day'
    and a.valide_a is null
    and public.est_personnel()
  order by c.debut
$$;

-- ---------- Coffre à téléphones ----------
create function public.deposer_telephone(p_eleve uuid, p_casier text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_vie_scolaire() then raise exception 'Droits insuffisants'; end if;
  insert into coffre_telephone (eleve_id, casier, depose_a, non_depose)
    values (p_eleve, nullif(btrim(p_casier), ''), now(), false)
  on conflict (eleve_id, jour) do update
    set casier = nullif(btrim(p_casier), ''), depose_a = now(), non_depose = false, restitue_a = null;
end $$;

create function public.restituer_telephone(p_eleve uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_vie_scolaire() then raise exception 'Droits insuffisants'; end if;
  update coffre_telephone set restitue_a = now()
   where eleve_id = p_eleve and jour = current_date and depose_a is not null and restitue_a is null;
end $$;

-- Téléphone non déposé : une observation est créée ; renvoie le total et le seuil de sanction (réglage).
create function public.signaler_non_depot(p_eleve uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare total int; seuil int;
begin
  if not public.est_vie_scolaire() then raise exception 'Droits insuffisants'; end if;
  insert into coffre_telephone (eleve_id, non_depose) values (p_eleve, true)
    on conflict (eleve_id, jour) do update set non_depose = true, depose_a = null, restitue_a = null, casier = null;
  insert into observations (eleve_id, type, texte) values (p_eleve, 'telephone', 'Téléphone non déposé au coffre');
  select count(*) into total from coffre_telephone where eleve_id = p_eleve and non_depose;
  select (valeur #>> '{}')::int into seuil from parametres where cle = 'telephone_non_depots_avant_sanction';
  seuil := coalesce(seuil, 3);
  return jsonb_build_object('total', total, 'seuil', seuil, 'sanction_a_prevoir', total >= seuil);
end $$;

revoke all on function
  public.est_vie_scolaire(), public.peut_appeler(uuid), public.ouvrir_appel(uuid), public.valider_appel(uuid),
  public.appels_manquants(), public.deposer_telephone(uuid, text), public.restituer_telephone(uuid),
  public.signaler_non_depot(uuid) from public, anon;
grant execute on function
  public.est_vie_scolaire(), public.peut_appeler(uuid), public.ouvrir_appel(uuid), public.valider_appel(uuid),
  public.appels_manquants(), public.deposer_telephone(uuid, text), public.restituer_telephone(uuid),
  public.signaler_non_depot(uuid) to authenticated;
