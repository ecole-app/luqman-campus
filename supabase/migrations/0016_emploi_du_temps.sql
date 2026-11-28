-- Luqmân Campus — étape 6 : emploi du temps.
-- Grille horaire (créneaux), salles, contraintes et préférences, versions d'emploi du temps (brouillons), séances,
-- contrôle des conflits côté serveur (une contrainte obligatoire n'est jamais violée), publication qui crée les cours
-- de l'année (jours de fermeture exclus) : l'appel, les absences et le suivi partent alors du vrai emploi du temps.
-- Le générateur tourne dans l'appli (app/edt-solveur.js) ; la base vérifie tout ce qu'on lui envoie.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite.

-- ---------- Ce qu'il faut savoir d'un enseignement pour le placer ----------
alter table public.enseignements
  add column bloc smallint not null default 1 check (bloc between 1 and 4),  -- durée d'une séance en créneaux (EPS : 2)
  add column groupe_id uuid references public.groupes(id) on delete set null; -- groupe concerné (langues, demi-groupes)

create table public.salles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(btrim(nom)) > 0),
  type text,                                   -- ex. « gymnase », « laboratoire »
  capacite integer check (capacite is null or capacite > 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.enseignements add column salle_id uuid references public.salles(id) on delete set null; -- salle imposée

-- Grille horaire : un créneau = un jour (1 = lundi … 6 = samedi) et une plage horaire.
create table public.creneaux (
  id uuid primary key default gen_random_uuid(),
  jour smallint not null check (jour between 1 and 6),
  debut time not null,
  fin time not null check (fin > debut),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jour, debut)
);
-- Grille de départ (modifiable) : 7 créneaux les lundi, mardi, jeudi, vendredi ; mercredi matin.
insert into public.creneaux(jour, debut, fin)
select j, h.d::time, h.f::time
from unnest(array[1, 2, 4, 5]) j,
     (values ('08:00', '08:55'), ('09:00', '09:55'), ('10:10', '11:05'), ('11:10', '12:05'), ('13:30', '14:25'), ('14:30', '15:25'), ('15:35', '16:30')) h(d, f)
union all
select 3, h.d::time, h.f::time from (values ('08:00', '08:55'), ('09:00', '09:55'), ('10:10', '11:05'), ('11:10', '12:05')) h(d, f);

-- Contraintes et préférences : « indisponible » pour un professeur, une classe, une salle ou une matière,
-- un jour (ou tous) et une plage (ou toute la journée). Obligatoire = contrainte ; sinon préférence avec un poids 1 à 5.
create table public.edt_regles (
  id uuid primary key default gen_random_uuid(),
  cible_type text not null check (cible_type in ('professeur', 'classe', 'salle', 'matiere')),
  cible_id uuid not null,
  jour smallint check (jour is null or jour between 1 and 6),
  debut time,
  fin time,
  obligatoire boolean not null default true,
  poids smallint not null default 3 check (poids between 1 and 5),
  motif text check (motif is null or length(motif) <= 200),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((debut is null) = (fin is null) and (fin is null or fin > debut))
);

create table public.edt_versions (
  id uuid primary key default gen_random_uuid(),
  annee_id uuid not null references public.annees_scolaires(id) on delete cascade,
  nom text not null check (length(btrim(nom)) between 1 and 80),
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie')),
  score jsonb,
  publie_du date,
  publie_au date,
  publie_le timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.edt_seances (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.edt_versions(id) on delete cascade,
  enseignement_id uuid not null references public.enseignements(id) on delete cascade,
  creneau_id uuid not null references public.creneaux(id) on delete cascade,   -- premier créneau de la séance
  salle_id uuid references public.salles(id) on delete set null,
  duree smallint check (duree is null or duree between 1 and 4),                -- en créneaux ; vide = bloc de l'enseignement
  verrouillee boolean not null default false,                                  -- gardée telle quelle à la génération
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, enseignement_id, creneau_id)
);
create index edt_seances_version on public.edt_seances (version_id);

alter table public.cours add column edt_version_id uuid references public.edt_versions(id) on delete set null;

insert into public.parametres(cle, valeur, description) values
 ('edt_max_matiere_jour', '2', 'Emploi du temps : nombre maximal d''heures d''une même matière par jour pour une classe')
on conflict (cle) do nothing;

do $$
declare t text;
begin
  foreach t in array array['salles', 'creneaux', 'edt_regles', 'edt_versions', 'edt_seances'] loop
    execute format('create trigger horodater_%1$s before insert or update on public.%1$s for each row execute function public.horodater()', t);
    execute format('create trigger auditer_%1$s after insert or update or delete on public.%1$s for each row execute function public.auditer()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_lecture on public.%1$s for select using (public.est_personnel())', t);
    execute format('create policy %1$s_ecriture on public.%1$s for all using (public.est_admin()) with check (public.est_admin())', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

-- La publication crée des milliers de cours : le journal d'audit garde la publication (edt_versions), pas chaque cours.
create or replace function public.auditer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'cours' and current_setting('lc.publication_edt', true) = 'oui' then return null; end if;
  insert into public.journal_audit(auteur, table_nom, operation, ligne_id, avant, apres)
  values (auth.uid(), tg_table_name, tg_op,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'cle',
                   (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'user_id'),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

-- ---------- Tout ce qu'il faut pour afficher et générer, en un appel ----------
create function public.edt_donnees(p_annee uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare an uuid := coalesce(p_annee, (select id from annees_scolaires where active order by debut desc limit 1), (select id from annees_scolaires order by debut desc limit 1));
begin
  if not public.est_personnel() then raise exception 'Réservé au personnel de l''établissement.'; end if;
  return jsonb_build_object(
    'annee', (select jsonb_build_object('id', a.id, 'libelle', a.libelle, 'debut', a.debut, 'fin', a.fin) from annees_scolaires a where a.id = an),
    'max_matiere_jour', coalesce((select (valeur #>> '{}')::int from parametres where cle = 'edt_max_matiere_jour'), 2),
    'creneaux', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'jour', jour, 'debut', to_char(debut, 'HH24:MI'), 'fin', to_char(fin, 'HH24:MI')) order by jour, debut) from creneaux), '[]'::jsonb),
    'salles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'type', type, 'capacite', capacite) order by nom) from salles where actif), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', nom, 'niveau', niveau) order by nom) from classes where annee_id = an), '[]'::jsonb),
    'matieres', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'nom', nom) order by nom) from matieres), '[]'::jsonb),
    'groupes', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'classe_id', g.classe_id, 'nom', g.nom) order by g.nom) from groupes g join classes c on c.id = g.classe_id where c.annee_id = an), '[]'::jsonb),
    'professeurs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nom', p.prenom || ' ' || p.nom) order by p.nom, p.prenom)
        from profils p where p.id in (select professeur_id from enseignements) or exists (select 1 from user_roles r where r.user_id = p.id and r.role in ('professeur', 'professeur_principal'))), '[]'::jsonb),
    'enseignements', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'classe_id', e.classe_id, 'matiere_id', e.matiere_id, 'professeur_id', e.professeur_id,
        'heures_hebdo', e.heures_hebdo, 'bloc', e.bloc, 'groupe_id', e.groupe_id, 'salle_id', e.salle_id))
        from enseignements e join classes c on c.id = e.classe_id where c.annee_id = an), '[]'::jsonb),
    'regles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'cible_type', cible_type, 'cible_id', cible_id, 'jour', jour, 'debut', to_char(debut, 'HH24:MI'), 'fin', to_char(fin, 'HH24:MI'),
        'obligatoire', obligatoire, 'poids', poids, 'motif', motif) order by created_at) from edt_regles where actif), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'nom', v.nom, 'statut', v.statut, 'score', v.score, 'publie_du', v.publie_du, 'publie_au', v.publie_au, 'updated_at', v.updated_at,
        'seances', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'enseignement_id', s.enseignement_id, 'creneau_id', s.creneau_id, 'salle_id', s.salle_id, 'duree', s.duree, 'verrouillee', s.verrouillee))
                   from edt_seances s where s.version_id = v.id), '[]'::jsonb)) order by v.created_at desc) from edt_versions v where v.annee_id = an), '[]'::jsonb));
end $$;

-- ---------- Occupation réelle d'une version (une ligne par créneau occupé) ----------
create function public.edt_occupation(p_version uuid)
returns table (seance_id uuid, enseignement_id uuid, classe_id uuid, professeur_id uuid, salle_id uuid, groupe_id uuid, matiere_id uuid,
               creneau_id uuid, jour smallint, debut time, fin time, rang int, bloc smallint)
language sql stable security definer set search_path = public as $$
  with cr as (select c.id, c.jour, c.debut, c.fin, row_number() over (partition by c.jour order by c.debut)::int rn from creneaux c)
  select s.id, e.id, e.classe_id, e.professeur_id, coalesce(s.salle_id, e.salle_id), e.groupe_id, e.matiere_id,
         c2.id, c2.jour, c2.debut, c2.fin, (c2.rn - c1.rn)::int, coalesce(s.duree, e.bloc)::smallint
  from edt_seances s join enseignements e on e.id = s.enseignement_id
  join cr c1 on c1.id = s.creneau_id
  join cr c2 on c2.jour = c1.jour and c2.rn between c1.rn and c1.rn + coalesce(s.duree, e.bloc) - 1
  where s.version_id = p_version
$$;

-- ---------- Conflits d'une version (contraintes obligatoires) ----------
create function public.controler_edt(p_version uuid) returns table (nature text, message text)
language plpgsql stable security definer set search_path = public as $$
declare mx int := coalesce((select (valeur #>> '{}')::int from parametres where cle = 'edt_max_matiere_jour'), 2);
begin
  if not public.est_personnel() then raise exception 'Réservé au personnel de l''établissement.'; end if;
  return query
  with o as (select * from public.edt_occupation(p_version)),
  nomc as (select o.*, cl.nom classe, m.nom matiere, to_char(o.debut, 'HH24:MI') h,
             (array['lundi','mardi','mercredi','jeudi','vendredi','samedi'])[o.jour] j from o join classes cl on cl.id = o.classe_id join matieres m on m.id = o.matiere_id)
  -- séance trop longue pour la fin de la demi-journée
  select 'bloc'::text, format('%s %s : la séance de %s h ne tient pas avant la pause (%s %s).', a.classe, a.matiere, a.bloc, a.j, a.h)
  from (select seance_id, min(classe) classe, min(matiere) matiere, min(bloc) bloc, min(j) j, min(h) h, count(*) n,
               max(case when rang > 0 then 1 else 0 end) x from nomc group by seance_id) a
  where a.n < a.bloc
  union all
  select 'bloc', format('%s %s : la séance de %s h est coupée par une pause (%s %s).', a.classe, a.matiere, a.bloc, a.j, a.h)
  from nomc a join nomc b on b.seance_id = a.seance_id and b.rang = a.rang + 1 where b.debut - a.fin > interval '20 minutes'
  union all
  select 'classe', format('%s : deux cours en même temps (%s et %s, %s %s).', a.classe, a.matiere, b.matiere, a.j, a.h)
  from nomc a join nomc b on b.creneau_id = a.creneau_id and b.classe_id = a.classe_id and b.seance_id > a.seance_id
  where not (a.groupe_id is not null and b.groupe_id is not null and a.groupe_id <> b.groupe_id)
  union all
  select 'professeur', format('%s : deux classes en même temps (%s et %s, %s %s).', coalesce((select p.prenom || ' ' || p.nom from profils p where p.id = a.professeur_id), 'Professeur'), a.classe, b.classe, a.j, a.h)
  from nomc a join nomc b on b.creneau_id = a.creneau_id and b.professeur_id = a.professeur_id and b.seance_id > a.seance_id
  union all
  select 'salle', format('%s : deux cours en même temps (%s et %s, %s %s).', sa.nom, a.classe, b.classe, a.j, a.h)
  from nomc a join nomc b on b.creneau_id = a.creneau_id and b.salle_id = a.salle_id and b.seance_id > a.seance_id join salles sa on sa.id = a.salle_id
  union all
  select 'indisponible', format('%s %s placé %s %s alors que %s.', a.classe, a.matiere, a.j, a.h, coalesce(r.motif, 'c''est une indisponibilité obligatoire'))
  from nomc a join edt_regles r on r.actif and r.obligatoire
    and (r.jour is null or r.jour = a.jour) and (r.debut is null or (a.debut < r.fin and a.fin > r.debut))
    and ((r.cible_type = 'professeur' and r.cible_id = a.professeur_id) or (r.cible_type = 'classe' and r.cible_id = a.classe_id)
      or (r.cible_type = 'salle' and r.cible_id = a.salle_id) or (r.cible_type = 'matiere' and r.cible_id = a.matiere_id))
  union all
  select 'matiere_jour', format('%s : %s h de %s le %s (maximum %s).', min(a.classe), count(*), min(a.matiere), min(a.j), mx)
  from nomc a group by a.classe_id, a.matiere_id, a.jour, a.groupe_id having count(*) > mx;
end $$;

-- ---------- Enregistrer une version entière (sortie du générateur) ----------
-- p_seances : [{"enseignement_id":"…","creneau_id":"…","salle_id":null,"duree":null,"verrouillee":false}]. Refusé s'il reste un conflit.
create function public.enregistrer_edt(p_version uuid, p_nom text, p_seances jsonb, p_score jsonb default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := p_version; an uuid; c record;
begin
  if not public.est_admin() then raise exception 'L''emploi du temps est géré par la direction.'; end if;
  if v is null then
    an := coalesce((select id from annees_scolaires where active order by debut desc limit 1), (select id from annees_scolaires order by debut desc limit 1));
    insert into edt_versions(annee_id, nom, score) values (an, coalesce(nullif(btrim(p_nom), ''), 'Emploi du temps'), p_score) returning id into v;
  else
    if not exists (select 1 from edt_versions where id = v) then raise exception 'Version introuvable'; end if;
    update edt_versions set nom = coalesce(nullif(btrim(p_nom), ''), nom), score = coalesce(p_score, score) where id = v;
    delete from edt_seances where version_id = v;
  end if;
  insert into edt_seances(version_id, enseignement_id, creneau_id, salle_id, duree, verrouillee)
  select v, (x->>'enseignement_id')::uuid, (x->>'creneau_id')::uuid, nullif(x->>'salle_id', '')::uuid, nullif(x->>'duree', '')::smallint, coalesce((x->>'verrouillee')::boolean, false)
  from jsonb_array_elements(coalesce(p_seances, '[]'::jsonb)) x;
  select * into c from public.controler_edt(v) limit 1;
  if found then raise exception 'Conflit : %', c.message; end if;
  return v;
end $$;

-- ---------- Modifier une séance à la main (déplacer, changer de salle, verrouiller) ----------
create function public.modifier_seance(p_seance uuid, p_creneau uuid default null, p_salle uuid default null, p_verrouillee boolean default null, p_sans_salle boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare s public.edt_seances; c record;
begin
  if not public.est_admin() then raise exception 'L''emploi du temps est géré par la direction.'; end if;
  select * into s from edt_seances where id = p_seance;
  if s.id is null then raise exception 'Séance introuvable'; end if;
  update edt_seances set creneau_id = coalesce(p_creneau, creneau_id),
                         salle_id = case when p_sans_salle then null else coalesce(p_salle, salle_id) end,
                         verrouillee = coalesce(p_verrouillee, verrouillee)
   where id = p_seance;
  select * into c from public.controler_edt(s.version_id) limit 1;
  if found then raise exception 'Impossible : %', c.message; end if;
end $$;

-- ---------- Publier : la version devient l'emploi du temps officiel et crée les cours ----------
-- Les cours à venir d'une publication précédente sont remplacés, sauf ceux dont l'appel est déjà ouvert.
create function public.publier_edt(p_version uuid, p_debut date, p_fin date) returns integer
language plpgsql security definer set search_path = public as $$
declare v public.edt_versions; n int; c record;
begin
  if not public.est_admin() then raise exception 'L''emploi du temps est géré par la direction.'; end if;
  select * into v from edt_versions where id = p_version;
  if v.id is null then raise exception 'Version introuvable'; end if;
  if p_debut is null or p_fin is null or p_fin < p_debut then raise exception 'Dates de publication invalides.'; end if;
  if p_fin - p_debut > 380 then raise exception 'Publication limitée à une année scolaire.'; end if;
  select * into c from public.controler_edt(p_version) limit 1;
  if found then raise exception 'Conflit à corriger avant de publier : %', c.message; end if;
  perform set_config('lc.publication_edt', 'oui', true);
  delete from cours co where co.edt_version_id is not null
    and (co.debut at time zone 'Europe/Paris')::date between p_debut and p_fin
    and not exists (select 1 from appels a where a.cours_id = co.id);
  insert into cours(enseignement_id, debut, fin, salle, groupe_id, edt_version_id)
  select o.enseignement_id, (d + min(o.debut)) at time zone 'Europe/Paris', (d + max(o.fin)) at time zone 'Europe/Paris',
         (select nom from salles where id = min(o.salle_id::text)::uuid), min(o.groupe_id::text)::uuid, p_version
  from public.edt_occupation(p_version) o
  join generate_series(p_debut, p_fin, interval '1 day') g(dd) on extract(isodow from g.dd) = o.jour
  cross join lateral (select g.dd::date d) x
  where not public.jour_ferme(x.d)
  group by o.seance_id, o.enseignement_id, x.d
  having not exists (select 1 from cours co where co.enseignement_id = o.enseignement_id and co.debut = (x.d + min(o.debut)) at time zone 'Europe/Paris');
  get diagnostics n = row_count;
  perform set_config('lc.publication_edt', '', true);
  update edt_versions set statut = 'brouillon', publie_le = null where annee_id = v.annee_id and id <> v.id and statut = 'publie';
  update edt_versions set statut = 'publie', publie_du = p_debut, publie_au = p_fin, publie_le = now() where id = v.id;
  return n;
end $$;

revoke all on function public.edt_donnees(uuid), public.edt_occupation(uuid), public.controler_edt(uuid), public.enregistrer_edt(uuid, text, jsonb, jsonb),
  public.modifier_seance(uuid, uuid, uuid, boolean, boolean), public.publier_edt(uuid, date, date) from public, anon;
grant execute on function public.edt_donnees(uuid), public.controler_edt(uuid), public.enregistrer_edt(uuid, text, jsonb, jsonb),
  public.modifier_seance(uuid, uuid, uuid, boolean, boolean), public.publier_edt(uuid, date, date) to authenticated;
