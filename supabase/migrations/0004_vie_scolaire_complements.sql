-- Luqmân Campus — étape 2 (compléments) : hors ligne, justification, absences prévues, corrections,
-- cours annulés / remplacés, groupes, calendrier, retenues complètes, sanctions et incidents,
-- infirmerie, observations confidentielles, élèves à surveiller, statistiques.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite.

-- ---------- Réglages ----------
insert into public.parametres(cle, valeur, description) values
 ('retards_seuil_alerte','3','Retards dans la période avant « élève à surveiller »'),
 ('absences_demi_journees_seuil','4','Demi-journées d''absence non justifiées dans le mois avant alerte'),
 ('heure_fin_matinee','"12:30"','Limite matin / après-midi pour compter les demi-journées'),
 ('hors_ligne_tolerance_min','240','Saisie hors ligne : heure du téléphone acceptée jusqu''à ce nombre de minutes avant la synchronisation'),
 ('sanctions_echelle','["Avertissement","Blâme","Mesure de responsabilisation","Exclusion temporaire de la classe","Exclusion temporaire de l''établissement","Exclusion définitive"]',
  'Échelle des sanctions (à adapter au règlement intérieur ; l''exclusion définitive relève du conseil de discipline)')
on conflict (cle) do nothing;

-- ---------- Calendrier : jours sans cours (vacances, fériés, ponts) ----------
create table public.fermetures (
  id uuid primary key default gen_random_uuid(),
  debut date not null,
  fin date not null,
  motif text not null check (length(btrim(motif)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin >= debut)
);
create function public.jour_ferme(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fermetures f where d between f.debut and f.fin)
$$;

-- ---------- Groupes (demi-groupes, langues, EPS) ----------
create table public.groupes (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  nom text not null check (length(btrim(nom)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classe_id, nom)
);
create table public.groupe_eleves (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid not null references public.groupes(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (groupe_id, eleve_id)
);

-- ---------- Cours : groupe, lieu, annulation, remplacement ----------
alter table public.cours
  add column groupe_id uuid references public.groupes(id) on delete set null,
  add column lieu text,
  add column hors_etablissement boolean not null default false,
  add column annule boolean not null default false,
  add column motif_annulation text,
  add column remplacant_id uuid references public.profils(id);

-- Le remplaçant peut faire l'appel du cours qu'il remplace.
create or replace function public.peut_appeler(p_cours uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_vie_scolaire()
      or (public.a_un_role(array['professeur','professeur_principal']::public.role_app[])
          and exists (select 1 from public.cours c join public.enseignements e on e.id = c.enseignement_id
                      where c.id = p_cours and (e.professeur_id = auth.uid() or c.remplacant_id = auth.uid())));
end $$;

-- Élèves concernés par un cours : le groupe s'il y en a un, sinon toute la classe.
create function public.eleves_du_cours(p_cours uuid) returns table (eleve_id uuid)
language sql stable security definer set search_path = public as $$
  select el.id
  from cours c join enseignements en on en.id = c.enseignement_id
       join eleves el on el.classe_id = en.classe_id and el.deleted_at is null
  where c.id = p_cours
    and (c.groupe_id is null or exists (select 1 from groupe_eleves g where g.groupe_id = c.groupe_id and g.eleve_id = el.id))
$$;

-- ---------- Présences : justification, hors ligne ----------
alter table public.presences
  add column justificatif_recu boolean not null default false,
  add column justifie_par uuid references public.profils(id),
  add column justifie_a timestamptz,
  add column saisie_hors_ligne boolean not null default false;

-- Heure de l'événement : celle du serveur, sauf saisie hors ligne ou correction (heure fournie par une
-- fonction du serveur, bornée), transmise par le réglage de transaction lc.heure_client.
create or replace function public.presence_calcul() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_debut timestamptz; palier int; t timestamptz;
begin
  t := coalesce(nullif(current_setting('lc.heure_client', true), '')::timestamptz, now());
  if tg_op = 'UPDATE' and new.statut is not distinct from old.statut
     and coalesce(current_setting('lc.heure_client', true), '') = '' then
    new.heure_evenement := old.heure_evenement;
    new.minutes_retard := old.minutes_retard;
    return new;
  end if;
  if new.statut = 'present' then
    new.heure_evenement := null; new.minutes_retard := null;
    new.autorise_par := null; new.recupere_par := null;
  else
    new.heure_evenement := t;
    if new.statut = 'retard' then
      select debut into v_debut from cours where id = new.cours_id;
      select (valeur #>> '{}')::int into palier from parametres where cle = 'retard_palier_min';
      palier := coalesce(palier, 5);
      new.minutes_retard := greatest(palier,
        (ceil(greatest(extract(epoch from t - v_debut) / 60, 0) / palier) * palier)::int);
    else
      new.minutes_retard := null;
    end if;
    if new.statut <> 'sortie' then new.autorise_par := null; new.recupere_par := null; end if;
  end if;
  return new;
end $$;

-- Règles : appel validé = modification seulement par correction ; justification seulement par la vie scolaire.
create function public.presence_protection() returns trigger
language plpgsql security definer set search_path = public as $$
declare ctx text := coalesce(current_setting('lc.contexte', true), '');
begin
  if ctx not in ('justification', 'appel') then
    if tg_op = 'INSERT' then
      new.justifiee := false; new.justificatif_recu := false; new.justifie_par := null; new.justifie_a := null;
    else
      new.justifiee := old.justifiee; new.justificatif_recu := old.justificatif_recu;
      new.justifie_par := old.justifie_par; new.justifie_a := old.justifie_a;
    end if;
  end if;
  if ctx <> 'synchro' then
    new.saisie_hors_ligne := case when tg_op = 'UPDATE' then old.saisie_hors_ligne else false end;
  end if;
  if tg_op = 'UPDATE' and ctx not in ('correction', 'infirmerie')
     and (new.statut, new.autorise_par, new.recupere_par) is distinct from (old.statut, old.autorise_par, old.recupere_par)
     and exists (select 1 from appels a where a.cours_id = new.cours_id and a.valide_a is not null) then
    raise exception 'Appel déjà validé : la modification passe par une correction de la vie scolaire';
  end if;
  return new;
end $$;
create trigger presence_protection before insert or update on public.presences
  for each row execute function public.presence_protection();

-- ---------- Absences prévues (rendez-vous, sortie pédagogique, voyage…) ----------
create table public.absences_prevues (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id),
  debut timestamptz not null,
  fin timestamptz not null,
  type text not null default 'absence' check (type in ('absence','rendez_vous','sortie_pedagogique','autre')),
  motif text not null check (length(btrim(motif)) > 0),
  justificatif_recu boolean not null default false,
  annulee boolean not null default false,
  auteur_id uuid references public.profils(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > debut)
);
create index absences_prevues_eleve on public.absences_prevues (eleve_id, debut);

create function public.libelle_absence_prevue(p_type text, p_motif text) returns text
language sql immutable as $$
  select case p_type when 'rendez_vous' then 'Rendez-vous' when 'sortie_pedagogique' then 'Sortie pédagogique'
                     when 'absence' then 'Absence prévue' else 'Prévu' end || ' : ' || p_motif
$$;

-- ---------- Corrections d'appel (tracées) ----------
create table public.corrections_presence (
  id uuid primary key default gen_random_uuid(),
  presence_id uuid not null references public.presences(id) on delete cascade,
  avant jsonb not null,
  apres jsonb not null,
  motif text not null check (length(btrim(motif)) > 0),
  auteur_id uuid references public.profils(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Retenues complètes ----------
create table public.seances_retenue (
  id uuid primary key default gen_random_uuid(),
  debut timestamptz not null,
  fin timestamptz not null,
  salle text,
  surveillant text,
  places smallint check (places > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > debut)
);

-- ---------- Incidents (rapport) ----------
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  survenu_a timestamptz not null default now(),
  lieu text,
  description text not null check (length(btrim(description)) > 0),
  statut text not null default 'ouvert' check (statut in ('ouvert','traite')),
  suites text,
  auteur_id uuid references public.profils(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.incident_eleves (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id),
  role text not null default 'auteur' check (role in ('auteur','victime','temoin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id, eleve_id)
);

alter table public.punitions
  add column seance_id uuid references public.seances_retenue(id) on delete set null,
  add column presence_retenue text check (presence_retenue in ('present','absent')),
  add column incident_id uuid references public.incidents(id) on delete set null;
alter table public.punitions drop constraint punitions_statut_check;
alter table public.punitions add constraint punitions_statut_check
  check (statut in ('demandee','a_faire','faite','non_faite','annulee'));

-- Règles des punitions : la retenue d'un professeur est une demande (validée par la vie scolaire),
-- son nombre d'heures est obligatoire ; une sanction est décidée par la direction.
create function public.punition_regles() returns trigger
language plpgsql security definer set search_path = public as $$
declare retenue boolean := new.type ~* 'retenue';
begin
  if retenue and new.duree_heures is null then raise exception 'Pour une retenue, indique le nombre d''heures'; end if;
  if tg_op = 'INSERT' then
    if new.nature = 'sanction' and not public.est_admin() then raise exception 'Une sanction est décidée par la direction'; end if;
    if not public.est_vie_scolaire() then
      new.statut := case when retenue then 'demandee' else 'a_faire' end;
      new.seance_id := null; new.presence_retenue := null;
    end if;
  else
    if new.nature = 'sanction' and old.nature <> 'sanction' and not public.est_admin() then
      raise exception 'Une sanction est décidée par la direction';
    end if;
    if not public.est_vie_scolaire() then
      new.seance_id := old.seance_id; new.presence_retenue := old.presence_retenue;
      if old.type ~* 'retenue' then new.statut := old.statut; end if;
    end if;
  end if;
  return new;
end $$;
create trigger punition_regles before insert or update on public.punitions
  for each row execute function public.punition_regles();

-- ---------- Infirmerie ----------
create table public.passages_infirmerie (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id),
  cours_id uuid references public.cours(id) on delete set null,
  arrivee_a timestamptz not null default now(),
  depart_a timestamptz,
  motif text,
  suite text check (suite in ('retour_classe','famille_prevenue','recupere_famille','urgence')),
  recupere_par text,
  auteur_id uuid references public.profils(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create function public.infirmerie_heures() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.arrivee_a := now(); new.depart_a := null; new.suite := null;
  else new.arrivee_a := old.arrivee_a;
       if coalesce(current_setting('lc.contexte', true), '') <> 'infirmerie' then
         new.depart_a := old.depart_a; new.suite := old.suite; new.recupere_par := old.recupere_par;
       end if;
  end if;
  return new;
end $$;
create trigger infirmerie_heures before insert or update on public.passages_infirmerie
  for each row execute function public.infirmerie_heures();

-- ---------- Observations confidentielles ----------
alter table public.observations add column confidentielle boolean not null default false;

-- ---------- Auteur, horodatage, audit, RLS sur les nouvelles tables ----------
do $$
declare t text;
begin
  foreach t in array array['absences_prevues','corrections_presence','incidents','passages_infirmerie'] loop
    execute format('create trigger forcer_auteur_%1$s before insert or update on public.%1$s
                    for each row execute function public.forcer_auteur()', t);
  end loop;
  foreach t in array array['fermetures','groupes','groupe_eleves','absences_prevues','corrections_presence',
                           'seances_retenue','incidents','incident_eleves','passages_infirmerie'] loop
    execute format('create trigger horodater_%1$s before insert or update on public.%1$s
                    for each row execute function public.horodater()', t);
    execute format('create trigger auditer_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.auditer()', t);
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;

create policy fermetures_lecture on public.fermetures for select using (public.est_personnel());
create policy fermetures_ecriture on public.fermetures for all using (public.est_admin()) with check (public.est_admin());
create policy groupes_lecture on public.groupes for select using (public.est_personnel());
create policy groupes_ecriture on public.groupes for all using (public.est_vie_scolaire()) with check (public.est_vie_scolaire());
create policy groupe_eleves_lecture on public.groupe_eleves for select using (public.est_personnel());
create policy groupe_eleves_ecriture on public.groupe_eleves for all using (public.est_vie_scolaire()) with check (public.est_vie_scolaire());
create policy absences_prevues_lecture on public.absences_prevues for select using (public.est_personnel());
create policy absences_prevues_ecriture on public.absences_prevues for all using (public.est_vie_scolaire()) with check (public.est_vie_scolaire());
create policy corrections_lecture on public.corrections_presence for select using (public.est_personnel());
create policy seances_lecture on public.seances_retenue for select using (public.est_personnel());
create policy seances_ecriture on public.seances_retenue for all using (public.est_vie_scolaire()) with check (public.est_vie_scolaire());
create policy incidents_lecture on public.incidents for select using (public.est_vie_scolaire() or auteur_id = auth.uid());
create policy incidents_ajout on public.incidents for insert with check (public.est_personnel());
create policy incidents_modif on public.incidents for update
  using (public.est_vie_scolaire() or auteur_id = auth.uid()) with check (public.est_vie_scolaire() or auteur_id = auth.uid());
create policy incident_eleves_lecture on public.incident_eleves for select using (
  public.est_vie_scolaire() or exists (select 1 from public.incidents i where i.id = incident_id and i.auteur_id = auth.uid()));
create policy incident_eleves_ecriture on public.incident_eleves for all
  using (public.est_vie_scolaire() or exists (select 1 from public.incidents i where i.id = incident_id and i.auteur_id = auth.uid()))
  with check (public.est_vie_scolaire() or exists (select 1 from public.incidents i where i.id = incident_id and i.auteur_id = auth.uid()));
create policy infirmerie_lecture on public.passages_infirmerie for select using (public.est_vie_scolaire());
create policy infirmerie_ajout on public.passages_infirmerie for insert with check (public.est_personnel());

drop policy observations_lecture on public.observations;
create policy observations_lecture on public.observations for select using (
  public.est_vie_scolaire() or auteur_id = auth.uid() or (not confidentielle and public.est_personnel()));

grant select, insert, update, delete on public.fermetures, public.groupes, public.groupe_eleves, public.absences_prevues,
  public.seances_retenue, public.incidents, public.incident_eleves to authenticated;
grant select on public.corrections_presence to authenticated;
grant select, insert on public.passages_infirmerie to authenticated;

-- ---------- Appel : groupes, cours annulés, absences prévues ----------
create or replace function public.ouvrir_appel(p_cours uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare nb int; c record;
begin
  if not public.peut_appeler(p_cours) then raise exception 'Vous ne pouvez pas faire l''appel de ce cours'; end if;
  select * into c from cours where id = p_cours;
  if c.annule then raise exception 'Ce cours est annulé'; end if;
  perform set_config('lc.contexte', 'appel', true);
  insert into appels (cours_id, ouvert_par) values (p_cours, auth.uid()) on conflict (cours_id) do nothing;
  insert into presences (cours_id, eleve_id, statut, justifiee, justificatif_recu, motif)
    select p_cours, x.eleve_id,
           case when ap.id is null then 'present' else 'absent' end::public.statut_presence,
           ap.id is not null, coalesce(ap.justificatif_recu, false),
           case when ap.id is null then null else public.libelle_absence_prevue(ap.type, ap.motif) end
    from public.eleves_du_cours(p_cours) x
    left join lateral (select a.* from absences_prevues a
                       where a.eleve_id = x.eleve_id and not a.annulee and a.debut < c.fin and a.fin > c.debut
                       order by a.created_at limit 1) ap on true
    on conflict (cours_id, eleve_id) do nothing;
  perform set_config('lc.contexte', '', true);
  select count(*) into nb from presences where cours_id = p_cours;
  return nb;
end $$;

-- Une absence prévue saisie après l'ouverture d'un appel non validé met à jour cet appel.
create function public.appliquer_absence_prevue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.annulee then return new; end if;
  perform set_config('lc.contexte', 'appel', true);
  update presences p set statut = 'absent', justifiee = true, justificatif_recu = new.justificatif_recu,
         motif = public.libelle_absence_prevue(new.type, new.motif)
    from cours c
   where p.cours_id = c.id and p.eleve_id = new.eleve_id and p.statut = 'present'
     and c.debut < new.fin and c.fin > new.debut
     and not exists (select 1 from appels a where a.cours_id = c.id and a.valide_a is not null);
  perform set_config('lc.contexte', '', true);
  return new;
end $$;
create trigger appliquer_absence_prevue after insert on public.absences_prevues
  for each row execute function public.appliquer_absence_prevue();

-- Synchronisation des saisies faites hors ligne : l'heure du téléphone est acceptée, bornée
-- (pas dans le futur, pas avant le cours, pas plus de hors_ligne_tolerance_min minutes en arrière).
create function public.synchroniser_presences(p_cours uuid, p_changements jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ch jsonb; h timestamptz; tol int; c record; nb int := 0; refus jsonb := '[]';
begin
  if not public.peut_appeler(p_cours) then raise exception 'Vous ne pouvez pas faire l''appel de ce cours'; end if;
  select * into c from cours where id = p_cours;
  if exists (select 1 from appels where cours_id = p_cours and valide_a is not null) then
    return jsonb_build_object('appliques', 0, 'refuses', p_changements, 'raison', 'Appel déjà validé entre-temps : voir la vie scolaire');
  end if;
  perform public.ouvrir_appel(p_cours);
  select coalesce((valeur #>> '{}')::int, 240) into tol from parametres where cle = 'hors_ligne_tolerance_min';
  tol := coalesce(tol, 240);
  for ch in select * from jsonb_array_elements(p_changements) loop
    h := nullif(ch->>'heure', '')::timestamptz;
    h := least(coalesce(h, now()), now());
    h := greatest(h, now() - make_interval(mins => tol), c.debut - interval '15 minutes');
    perform set_config('lc.heure_client', h::text, true);
    perform set_config('lc.contexte', 'synchro', true);
    update presences set statut = (ch->>'statut')::public.statut_presence,
           autorise_par = nullif(ch->>'autorise_par', ''), recupere_par = nullif(ch->>'recupere_par', ''),
           saisie_hors_ligne = true
     where cours_id = p_cours and eleve_id = (ch->>'eleve_id')::uuid;
    if found then nb := nb + 1; else refus := refus || jsonb_build_array(ch); end if;
  end loop;
  perform set_config('lc.heure_client', '', true);
  perform set_config('lc.contexte', '', true);
  return jsonb_build_object('appliques', nb, 'refuses', refus);
end $$;

-- Correction d'un appel validé : vie scolaire, motif obligatoire, heure réelle possible, tracée.
create function public.corriger_presence(p_presence uuid, p_statut public.statut_presence, p_motif text,
  p_heure timestamptz default null, p_autorise text default null, p_recupere text default null) returns void
language plpgsql security definer set search_path = public as $$
declare av jsonb; ap jsonb; c record;
begin
  if not public.est_vie_scolaire() then raise exception 'Seule la vie scolaire corrige un appel'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Le motif de la correction est obligatoire'; end if;
  select to_jsonb(p) into av from presences p where id = p_presence;
  if av is null then raise exception 'Présence introuvable'; end if;
  select * into c from cours where id = (av->>'cours_id')::uuid;
  perform set_config('lc.contexte', 'correction', true);
  if p_heure is not null then
    perform set_config('lc.heure_client', greatest(least(p_heure, now()), c.debut - interval '15 minutes')::text, true);
  end if;
  update presences set statut = p_statut, autorise_par = nullif(btrim(p_autorise), ''), recupere_par = nullif(btrim(p_recupere), '')
   where id = p_presence returning to_jsonb(presences.*) into ap;
  perform set_config('lc.heure_client', '', true);
  perform set_config('lc.contexte', '', true);
  insert into corrections_presence (presence_id, avant, apres, motif) values (p_presence, av, ap, btrim(p_motif));
end $$;

-- Justification d'absences ou de retards (vie scolaire).
create function public.justifier_absences(p_presences uuid[], p_justifiee boolean, p_motif text, p_justificatif boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  if not public.est_vie_scolaire() then raise exception 'Seule la vie scolaire justifie une absence'; end if;
  perform set_config('lc.contexte', 'justification', true);
  update presences set justifiee = p_justifiee, motif = coalesce(nullif(btrim(p_motif), ''), motif),
         justificatif_recu = coalesce(p_justificatif, false), justifie_par = auth.uid(), justifie_a = now()
   where id = any(p_presences) and statut in ('absent', 'retard');
  get diagnostics nb = row_count;
  perform set_config('lc.contexte', '', true);
  return nb;
end $$;

-- Cours annulé ou remplacé (vie scolaire).
create function public.annuler_cours(p_cours uuid, p_annule boolean, p_motif text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_vie_scolaire() then raise exception 'Droits insuffisants'; end if;
  if p_annule and coalesce(btrim(p_motif), '') = '' then raise exception 'Indique le motif de l''annulation'; end if;
  update cours set annule = p_annule, motif_annulation = case when p_annule then btrim(p_motif) end where id = p_cours;
end $$;
create function public.remplacer_cours(p_cours uuid, p_prof uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_vie_scolaire() then raise exception 'Droits insuffisants'; end if;
  update cours set remplacant_id = p_prof where id = p_cours;
end $$;
-- Liste des professeurs (pour choisir un remplaçant) : personnel connecté seulement.
create function public.liste_professeurs() returns table (id uuid, nom text, prenom text)
language sql stable security definer set search_path = public as $$
  select distinct p.id, p.nom, p.prenom from profils p join user_roles r on r.user_id = p.id
  where p.actif and r.role in ('professeur','professeur_principal') and public.est_personnel() and auth.uid() is not null
  order by p.nom, p.prenom
$$;

-- Appels non faits : ni cours annulés, ni jours fermés ; le remplaçant est le professeur à prévenir.
create or replace function public.appels_manquants()
returns table (cours_id uuid, debut timestamptz, classe text, matiere text, professeur_id uuid, minutes_ecoulees int, niveau text)
language sql stable security definer set search_path = public as $$
  with p as (
    select coalesce((select (valeur #>> '{}')::int from parametres where cle = 'appel_delai_min'), 30) as delai,
           coalesce((select (valeur #>> '{}')::int from parametres where cle = 'appel_alerte_vs_min'), 15) as alerte)
  select c.id, c.debut, cl.nom, m.nom, coalesce(c.remplacant_id, en.professeur_id),
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
    and not c.annule
    and not public.jour_ferme((c.debut at time zone 'Europe/Paris')::date)
    and public.est_personnel()
  order by c.debut
$$;

-- ---------- Infirmerie : départ (suite donnée) ----------
create function public.infirmerie_depart(p_passage uuid, p_suite text, p_recupere_par text default null) returns void
language plpgsql security definer set search_path = public as $$
declare pa record; pr record;
begin
  if not public.est_vie_scolaire() then raise exception 'Droits insuffisants'; end if;
  if p_suite not in ('retour_classe','famille_prevenue','recupere_famille','urgence') then raise exception 'Suite inconnue'; end if;
  if p_suite = 'recupere_famille' and coalesce(btrim(p_recupere_par), '') = '' then raise exception 'Indique qui est venu chercher l''élève'; end if;
  perform set_config('lc.contexte', 'infirmerie', true);
  update passages_infirmerie set depart_a = now(), suite = p_suite, recupere_par = nullif(btrim(p_recupere_par), '')
   where id = p_passage and depart_a is null returning * into pa;
  if pa.id is null then raise exception 'Passage introuvable ou déjà clos'; end if;
  -- Élève récupéré par sa famille : sortie dans le cours en cours, s'il a un appel.
  if p_suite in ('recupere_famille', 'urgence') then
    select p.* into pr from presences p join cours c on c.id = p.cours_id
     where p.eleve_id = pa.eleve_id and c.debut <= now() and c.fin > now() order by c.debut desc limit 1;
    if pr.id is not null then
      update presences set statut = 'sortie', autorise_par = 'Infirmerie', recupere_par = coalesce(pa.recupere_par, 'Urgence')
       where id = pr.id;
      insert into corrections_presence (presence_id, avant, apres, motif)
        select pr.id, to_jsonb(pr), to_jsonb(p), 'Départ depuis l''infirmerie' from presences p where p.id = pr.id;
    end if;
  end if;
  perform set_config('lc.contexte', '', true);
end $$;

-- ---------- Élèves à surveiller (seuils réglables) ----------
create function public.eleves_a_surveiller()
returns table (eleve_id uuid, retards_periode int, demi_journees_mois int, non_depots int, motifs text[])
language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce((select (valeur #>> '{}')::int from parametres where cle = 'retards_seuil_alerte'), 3) as s_ret,
           coalesce((select (valeur #>> '{}')::int from parametres where cle = 'absences_demi_journees_seuil'), 4) as s_abs,
           coalesce((select (valeur #>> '{}')::int from parametres where cle = 'telephone_non_depots_avant_sanction'), 3) as s_tel,
           coalesce((select (valeur #>> '{}')::time from parametres where cle = 'heure_fin_matinee'), time '12:30') as midi,
           coalesce((select p.debut from periodes p join annees_scolaires a on a.id = p.annee_id
                     where a.active and current_date between p.debut and p.fin limit 1), current_date - 90) as debut_periode),
  r as (select pr.eleve_id, count(*)::int n from presences pr join cours c on c.id = pr.cours_id, s
        where pr.statut = 'retard' and (c.debut at time zone 'Europe/Paris')::date >= s.debut_periode group by pr.eleve_id),
  d as (select pr.eleve_id, count(distinct ((c.debut at time zone 'Europe/Paris')::date::text
                 || case when (c.debut at time zone 'Europe/Paris')::time < s.midi then 'M' else 'A' end))::int n
        from presences pr join cours c on c.id = pr.cours_id, s
        where pr.statut = 'absent' and not pr.justifiee
          and c.debut >= (date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
        group by pr.eleve_id),
  t as (select k.eleve_id, count(*)::int n from coffre_telephone k, s where k.non_depose and k.jour >= s.debut_periode group by k.eleve_id)
  select e.id, coalesce(r.n, 0), coalesce(d.n, 0), coalesce(t.n, 0),
         array_remove(array[case when r.n >= s.s_ret then 'retards' end,
                            case when d.n >= s.s_abs then 'absences' end,
                            case when t.n >= s.s_tel then 'telephone' end], null)
  from s, eleves e left join r on r.eleve_id = e.id left join d on d.eleve_id = e.id left join t on t.eleve_id = e.id
  where e.deleted_at is null and public.est_personnel()
    and (r.n >= s.s_ret or d.n >= s.s_abs or t.n >= s.s_tel)
  order by coalesce(d.n, 0) desc, coalesce(r.n, 0) desc
$$;

-- ---------- Statistiques d'absentéisme par classe ----------
create function public.stats_absenteisme(p_debut date, p_fin date)
returns table (classe_id uuid, classe text, saisies int, absences int, non_justifiees int, retards int, taux_absence numeric)
language sql stable security definer set search_path = public as $$
  select cl.id, cl.nom, count(pr.id)::int,
         count(*) filter (where pr.statut = 'absent')::int,
         count(*) filter (where pr.statut = 'absent' and not pr.justifiee)::int,
         count(*) filter (where pr.statut = 'retard')::int,
         round(100.0 * count(*) filter (where pr.statut = 'absent') / nullif(count(pr.id), 0), 1)
  from classes cl
  left join enseignements en on en.classe_id = cl.id
  left join cours c on c.enseignement_id = en.id and not c.annule
       and (c.debut at time zone 'Europe/Paris')::date between p_debut and p_fin
  left join presences pr on pr.cours_id = c.id
  where public.est_personnel()
  group by cl.id, cl.nom
  order by cl.nom
$$;

-- ---------- Droits sur les fonctions ----------
revoke all on function
  public.jour_ferme(date), public.eleves_du_cours(uuid), public.synchroniser_presences(uuid, jsonb),
  public.corriger_presence(uuid, public.statut_presence, text, timestamptz, text, text),
  public.justifier_absences(uuid[], boolean, text, boolean), public.annuler_cours(uuid, boolean, text),
  public.remplacer_cours(uuid, uuid), public.liste_professeurs(), public.infirmerie_depart(uuid, text, text),
  public.eleves_a_surveiller(), public.stats_absenteisme(date, date) from public, anon;
grant execute on function
  public.jour_ferme(date), public.eleves_du_cours(uuid), public.synchroniser_presences(uuid, jsonb),
  public.corriger_presence(uuid, public.statut_presence, text, timestamptz, text, text),
  public.justifier_absences(uuid[], boolean, text, boolean), public.annuler_cours(uuid, boolean, text),
  public.remplacer_cours(uuid, uuid), public.liste_professeurs(), public.infirmerie_depart(uuid, text, text),
  public.eleves_a_surveiller(), public.stats_absenteisme(date, date) to authenticated;
