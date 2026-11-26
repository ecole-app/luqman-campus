-- Luqmân Campus — étape 3 : notes et compétences
-- Évaluations (barème, coefficient), notes (absent, dispensé, non rendu), moyennes par matière et générale
-- avec rang, verrouillage des périodes, compétences de cycle (socle) avec 4 niveaux et bilan par période.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite.

-- ---------- Réglages ----------
insert into public.parametres(cle, valeur, description) values
 ('note_seuil_haut','18','Note (ramenée sur 20) à partir de laquelle la pastille est jaune pétillant'),
 ('note_seuil_bas','8','Note (ramenée sur 20) en dessous de laquelle la pastille est rouge écarlate'),
 ('notes_visibles_tout_personnel','false','Si vrai, tout le personnel voit toutes les notes. Sinon : chaque professeur voit ses matières, le professeur principal sa classe, la direction tout'),
 ('note_non_rendu_compte_zero','true','Un devoir « non rendu » compte 0 dans la moyenne (sinon il est ignoré)'),
 ('niveaux_competences','["Maîtrise insuffisante","Maîtrise fragile","Maîtrise satisfaisante","Très bonne maîtrise"]',
  'Les 4 niveaux d''évaluation d''une compétence, du plus faible au plus fort')
on conflict (cle) do nothing;

create type public.statut_note as enum ('note','absent','dispense','non_rendu');

-- 6e = cycle 3 ; 5e, 4e, 3e = cycle 4
create function public.cycle_du_niveau(n text) returns smallint language sql immutable as $$
  select (case when n = '6e' then 3 when n in ('5e','4e','3e') then 4 end)::smallint
$$;

-- ---------- Compétences de cycle (socle commun, modifiables par l'administration) ----------
create table public.competences (
  id uuid primary key default gen_random_uuid(),
  cycle smallint not null check (cycle in (3, 4)),
  code text not null check (length(btrim(code)) > 0),
  domaine text not null,
  libelle text not null check (length(btrim(libelle)) > 0),
  ordre smallint not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle, code)
);

insert into public.competences (cycle, code, domaine, libelle, ordre)
select c.cycle, d.code, d.domaine, d.libelle, d.ordre
from (values (3), (4)) c(cycle)
cross join (values
  ('D1.1', 'Domaine 1 · Langages pour penser et communiquer', 'Comprendre, s''exprimer en utilisant la langue française à l''oral et à l''écrit', 1),
  ('D1.2', 'Domaine 1 · Langages pour penser et communiquer', 'Comprendre, s''exprimer en utilisant une langue étrangère', 2),
  ('D1.3', 'Domaine 1 · Langages pour penser et communiquer', 'Comprendre, s''exprimer en utilisant les langages mathématiques, scientifiques et informatiques', 3),
  ('D1.4', 'Domaine 1 · Langages pour penser et communiquer', 'Comprendre, s''exprimer en utilisant les langages des arts et du corps', 4),
  ('D2',   'Domaine 2 · Méthodes et outils pour apprendre', 'Organiser son travail, coopérer, utiliser les outils numériques', 5),
  ('D3',   'Domaine 3 · Formation de la personne et du citoyen', 'Exprimer ses opinions, respecter les règles de la vie collective', 6),
  ('D4',   'Domaine 4 · Systèmes naturels et techniques', 'Mener une démarche scientifique, concevoir, créer, réaliser', 7),
  ('D5',   'Domaine 5 · Représentations du monde et activité humaine', 'Se situer dans l''espace et dans le temps, comprendre les organisations humaines', 8)
) d(code, domaine, libelle, ordre);

-- ---------- Évaluations ----------
create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  enseignement_id uuid not null references public.enseignements(id) on delete cascade,
  periode_id uuid not null references public.periodes(id),      -- déduite de la date par le serveur
  titre text not null check (length(btrim(titre)) > 0),
  date_eval date not null default current_date,
  type text not null default 'devoir' check (type in ('devoir','controle','oral','tp','projet','autre')),
  bareme numeric(5,2) not null default 20 check (bareme > 0),
  coefficient numeric(4,2) not null default 1 check (coefficient > 0),
  commentaire text,
  visible_familles boolean not null default false,               -- utilisé en phase 2 (accès élèves et parents)
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index evaluations_ens on public.evaluations (enseignement_id, periode_id);

create table public.evaluation_competences (
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  competence_id uuid not null references public.competences(id),
  primary key (evaluation_id, competence_id)
);

-- ---------- Notes ----------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id),
  statut public.statut_note not null default 'note',
  valeur numeric(5,2),
  commentaire text,
  saisi_par uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, eleve_id),
  check ((statut = 'note' and valeur is not null and valeur >= 0) or (statut <> 'note' and valeur is null))
);
create index notes_eleve on public.notes (eleve_id);

-- ---------- Acquisition des compétences (niveau 1 à 4) ----------
create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null,
  competence_id uuid not null,
  eleve_id uuid not null references public.eleves(id),
  niveau smallint not null check (niveau between 1 and 4),
  saisi_par uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, competence_id, eleve_id),
  foreign key (evaluation_id, competence_id) references public.evaluation_competences(evaluation_id, competence_id) on delete cascade
);
create index acquisitions_eleve on public.acquisitions (eleve_id);

-- Bilan de période : le professeur principal (ou la direction) peut corriger le niveau proposé
create table public.bilans_competences (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id),
  competence_id uuid not null references public.competences(id),
  periode_id uuid not null references public.periodes(id),
  niveau smallint not null check (niveau between 1 and 4),
  saisi_par uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, competence_id, periode_id)
);

-- ---------- Droits d'écriture ----------
create function public.periode_est_verrouillee(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select verrouillee from public.periodes where id = p), false)
$$;

-- Un professeur note ses propres enseignements ; l'administration note partout.
create function public.peut_noter(p_enseignement uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or (public.a_un_role(array['professeur','professeur_principal']::public.role_app[])
          and exists (select 1 from public.enseignements e where e.id = p_enseignement and e.professeur_id = auth.uid()));
end $$;

create function public.peut_noter_eval(p_eval uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.peut_noter((select enseignement_id from public.evaluations where id = p_eval))
$$;

-- Le bilan de compétences : la direction, ou le professeur principal de la classe de l'élève.
create function public.peut_bilan(p_eleve uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or (public.a_un_role(array['professeur_principal']::public.role_app[])
          and exists (select 1 from public.eleves e join public.classes c on c.id = e.classe_id
                      where e.id = p_eleve and c.prof_principal_id = auth.uid()));
end $$;

-- Qui peut LIRE les notes : l'administration ; le professeur de la matière ; le professeur principal de la classe ;
-- tout le personnel seulement si le réglage notes_visibles_tout_personnel est à vrai.
create function public.voit_toute_la_classe(p_classe uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or (public.est_personnel() and coalesce((select (valeur #>> '{}')::boolean from public.parametres where cle = 'notes_visibles_tout_personnel'), false))
      or exists (select 1 from public.classes c where c.id = p_classe and c.prof_principal_id = auth.uid());
end $$;

create function public.voit_notes_ens(p_enseignement uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or exists (select 1 from public.enseignements e
                 where e.id = p_enseignement
                   and (e.professeur_id = auth.uid() or public.voit_toute_la_classe(e.classe_id)));
end $$;

create function public.voit_notes_eval(p_eval uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.voit_notes_ens((select enseignement_id from public.evaluations where id = p_eval))
$$;

create function public.voit_bilan_eleve(p_eleve uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or exists (select 1 from public.eleves el where el.id = p_eleve and public.voit_toute_la_classe(el.classe_id));
end $$;

-- ---------- Règles côté serveur ----------
-- Évaluation : la période vient de la date ; période verrouillée = seule l'administration modifie.
create function public.evaluation_regles() returns trigger
language plpgsql security definer set search_path = public as $$
declare an uuid; p uuid;
begin
  if tg_op = 'DELETE' then
    if public.periode_est_verrouillee(old.periode_id) and not public.est_admin() then
      raise exception 'Période verrouillée : seule la direction peut supprimer cette évaluation';
    end if;
    return old;
  end if;
  select c.annee_id into an from enseignements en join classes c on c.id = en.classe_id where en.id = new.enseignement_id;
  select id into p from periodes where annee_id = an and new.date_eval between debut and fin;
  if p is null then raise exception 'Aucune période ne couvre la date du %', to_char(new.date_eval, 'DD/MM/YYYY'); end if;
  new.periode_id := p;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
    if new.enseignement_id <> old.enseignement_id then raise exception 'Une évaluation ne change pas d''enseignement'; end if;
    if public.periode_est_verrouillee(old.periode_id) and not public.est_admin() then
      raise exception 'Période verrouillée : cette évaluation ne peut plus être modifiée (voir la direction)';
    end if;
    if new.bareme < old.bareme and exists (select 1 from notes where evaluation_id = new.id and valeur > new.bareme) then
      raise exception 'Le barème est inférieur à une note déjà saisie';
    end if;
  end if;
  if public.periode_est_verrouillee(new.periode_id) and not public.est_admin() then
    raise exception 'Période verrouillée : impossible d''ajouter ou de déplacer une évaluation dans cette période';
  end if;
  return new;
end $$;
create trigger evaluations_regles before insert or update or delete on public.evaluations
  for each row execute function public.evaluation_regles();

-- Note / acquisition : l'élève doit être dans la classe, note ≤ barème, période non verrouillée.
create function public.note_regles() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev public.evaluations%rowtype; cl uuid;
begin
  if tg_op = 'DELETE' then
    select * into ev from evaluations where id = old.evaluation_id;
    if found and public.periode_est_verrouillee(ev.periode_id) and not public.est_admin() then
      raise exception 'Période verrouillée : les notes ne peuvent plus être supprimées';
    end if;
    return old;
  end if;
  select * into ev from evaluations where id = new.evaluation_id;
  if public.periode_est_verrouillee(ev.periode_id) and not public.est_admin() then
    raise exception 'Période verrouillée : les notes ne peuvent plus être modifiées (voir la direction)';
  end if;
  select en.classe_id into cl from enseignements en where en.id = ev.enseignement_id;
  if not exists (select 1 from eleves where id = new.eleve_id and classe_id = cl and deleted_at is null) then
    raise exception 'Cet élève n''est pas dans la classe de cette évaluation';
  end if;
  if tg_table_name = 'notes' then
    if new.statut = 'note' and new.valeur > ev.bareme then
      raise exception 'La note dépasse le barème (sur %)', ev.bareme;
    end if;
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.saisi_par := auth.uid(); end if;
  else
    new.saisi_par := coalesce(auth.uid(), old.saisi_par);
  end if;
  return new;
end $$;
create trigger notes_regles before insert or update or delete on public.notes
  for each row execute function public.note_regles();
create trigger acquisitions_regles before insert or update or delete on public.acquisitions
  for each row execute function public.note_regles();

create function public.bilan_regles() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then new.saisi_par := auth.uid(); end if;
  return new;
end $$;
create trigger bilans_regles before insert or update on public.bilans_competences
  for each row execute function public.bilan_regles();

-- ---------- Horodatage serveur, journal d'audit, RLS ----------
do $$
declare t text;
begin
  foreach t in array array['competences','evaluations','notes','acquisitions','bilans_competences'] loop
    execute format('create trigger horodater_%1$s before insert or update on public.%1$s
                    for each row execute function public.horodater()', t);
    execute format('create trigger auditer_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.auditer()', t);
  end loop;
  create trigger auditer_evaluation_competences after insert or update or delete on public.evaluation_competences
    for each row execute function public.auditer();
  foreach t in array array['competences','evaluations','evaluation_competences','notes','acquisitions','bilans_competences'] loop
    execute format('alter table public.%1$s enable row level security', t);
    if t = 'competences' then
      execute format('create policy %1$s_lecture on public.%1$s for select using (public.est_personnel())', t);
    end if;
  end loop;
end $$;

-- Les élèves et les parents n'ont aucun accès aux notes avant la phase 2.
create policy evaluations_lecture on public.evaluations for select using (public.voit_notes_ens(enseignement_id));
create policy evaluation_competences_lecture on public.evaluation_competences for select using (public.voit_notes_eval(evaluation_id));
create policy notes_lecture on public.notes for select using (public.voit_notes_eval(evaluation_id));
create policy acquisitions_lecture on public.acquisitions for select using (public.voit_notes_eval(evaluation_id));
create policy bilans_competences_lecture on public.bilans_competences for select using (public.voit_bilan_eleve(eleve_id));
create policy competences_ecriture on public.competences for all
  using (public.est_admin()) with check (public.est_admin());
create policy evaluations_ecriture on public.evaluations for all
  using (public.peut_noter(enseignement_id)) with check (public.peut_noter(enseignement_id));
create policy evaluation_competences_ecriture on public.evaluation_competences for all
  using (public.peut_noter_eval(evaluation_id)) with check (public.peut_noter_eval(evaluation_id));
create policy notes_ecriture on public.notes for all
  using (public.peut_noter_eval(evaluation_id)) with check (public.peut_noter_eval(evaluation_id));
create policy acquisitions_ecriture on public.acquisitions for all
  using (public.peut_noter_eval(evaluation_id)) with check (public.peut_noter_eval(evaluation_id));
create policy bilans_competences_ecriture on public.bilans_competences for all
  using (public.peut_bilan(eleve_id)) with check (public.peut_bilan(eleve_id));

grant select, insert, update, delete on
  public.competences, public.evaluations, public.evaluation_competences, public.notes,
  public.acquisitions, public.bilans_competences to authenticated;

-- ---------- Saisie en lot (atomique) ----------
-- [{"eleve_id":"…","statut":"note|absent|dispense|non_rendu","valeur":"14,5","commentaire":"…"}]
-- Une ligne sans statut ni valeur efface la note. Droits et règles : ceux de la table (invoker).
create function public.saisir_notes(p_eval uuid, p_lignes jsonb) returns integer
language plpgsql set search_path = public as $$
declare l jsonb; n int := 0; v numeric; st public.statut_note; el uuid;
begin
  if jsonb_typeof(p_lignes) <> 'array' then raise exception 'Format de saisie invalide'; end if;
  for l in select * from jsonb_array_elements(p_lignes) loop
    el := (l->>'eleve_id')::uuid;
    if nullif(l->>'statut', '') is null and nullif(btrim(coalesce(l->>'valeur', '')), '') is null then
      delete from notes where evaluation_id = p_eval and eleve_id = el;
    else
      st := coalesce(nullif(l->>'statut', ''), 'note')::public.statut_note;
      if st = 'note' then
        begin
          v := replace(btrim(l->>'valeur'), ',', '.')::numeric;
        exception when others then
          raise exception 'Note illisible : « % »', l->>'valeur';
        end;
        if v < 0 then raise exception 'Une note ne peut pas être négative'; end if;
      else
        v := null;
      end if;
      insert into notes (evaluation_id, eleve_id, statut, valeur, commentaire)
      values (p_eval, el, st, v, nullif(btrim(coalesce(l->>'commentaire', '')), ''))
      on conflict (evaluation_id, eleve_id) do update
        set statut = excluded.statut, valeur = excluded.valeur, commentaire = excluded.commentaire;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- [{"eleve_id":"…","competence_id":"…","niveau":3}] ; niveau vide = effacer
create function public.saisir_acquisitions(p_eval uuid, p_lignes jsonb) returns integer
language plpgsql set search_path = public as $$
declare l jsonb; n int := 0; el uuid; co uuid; nv smallint;
begin
  if jsonb_typeof(p_lignes) <> 'array' then raise exception 'Format de saisie invalide'; end if;
  for l in select * from jsonb_array_elements(p_lignes) loop
    el := (l->>'eleve_id')::uuid; co := (l->>'competence_id')::uuid;
    nv := nullif(l->>'niveau', '')::smallint;
    if nv is null then
      delete from acquisitions where evaluation_id = p_eval and eleve_id = el and competence_id = co;
    else
      insert into acquisitions (evaluation_id, competence_id, eleve_id, niveau) values (p_eval, co, el, nv)
      on conflict (evaluation_id, competence_id, eleve_id) do update set niveau = excluded.niveau;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Moyennes ----------
-- Chaque note est ramenée sur 20, pondérée par le coefficient de l'évaluation.
-- Absent et dispensé sont ignorés ; « non rendu » compte 0 selon le réglage.
-- p_periode vide = toute l'année (toutes les notes ensemble). Aucun arrondi ici.
create function public.calcul_moyennes_ens(p_classe uuid, p_periode uuid)
returns table (eleve_id uuid, enseignement_id uuid, moy numeric, nb int)
language sql stable security definer set search_path = public as $$
  with reg as (select coalesce((select (valeur #>> '{}')::boolean from parametres where cle = 'note_non_rendu_compte_zero'), true) as zero)
  select n.eleve_id, ev.enseignement_id,
         sum(case when n.statut = 'note' then n.valeur / ev.bareme * 20 * ev.coefficient
                  when n.statut = 'non_rendu' and reg.zero then 0 end)
           / nullif(sum(case when n.statut = 'note' or (n.statut = 'non_rendu' and reg.zero) then ev.coefficient end), 0),
         (count(*) filter (where n.statut = 'note' or (n.statut = 'non_rendu' and reg.zero)))::int
  from reg, notes n
  join evaluations ev on ev.id = n.evaluation_id
  join enseignements en on en.id = ev.enseignement_id and en.classe_id = p_classe
  join eleves e on e.id = n.eleve_id and e.classe_id = p_classe and e.deleted_at is null
  where p_periode is null or ev.periode_id = p_periode
  group by n.eleve_id, ev.enseignement_id, reg.zero
$$;

create function public.moyennes_matieres(p_classe uuid, p_periode uuid default null)
returns table (eleve_id uuid, enseignement_id uuid, matiere_id uuid, moyenne numeric, nb_notes int,
               moyenne_classe numeric, minimum numeric, maximum numeric)
language sql stable security definer set search_path = public as $$
  select x.eleve_id, x.enseignement_id, en.matiere_id, round(x.moy, 2), x.nb,
         round(avg(x.moy) over (partition by x.enseignement_id), 2),
         round(min(x.moy) over (partition by x.enseignement_id), 2),
         round(max(x.moy) over (partition by x.enseignement_id), 2)
  from public.calcul_moyennes_ens(p_classe, p_periode) x
  join enseignements en on en.id = x.enseignement_id
  where x.moy is not null and public.voit_notes_ens(x.enseignement_id)
$$;

-- Moyenne générale pondérée par le coefficient de chaque matière ; rang (ex æquo = même rang).
create function public.moyennes_generales(p_classe uuid, p_periode uuid default null)
returns table (eleve_id uuid, moyenne numeric, nb_matieres int, rang int,
               moyenne_classe numeric, minimum numeric, maximum numeric)
language sql stable security definer set search_path = public as $$
  with g as (
    select x.eleve_id, sum(x.moy * en.coefficient) / sum(en.coefficient) as m, count(*)::int as nb
    from public.calcul_moyennes_ens(p_classe, p_periode) x
    join enseignements en on en.id = x.enseignement_id
    where x.moy is not null
    group by x.eleve_id)
  select g.eleve_id, round(g.m, 2), g.nb,
         (rank() over (order by round(g.m, 2) desc))::int,
         round(avg(g.m) over (), 2), round(min(g.m) over (), 2), round(max(g.m) over (), 2)
  from g
  where public.voit_toute_la_classe(p_classe)
  order by 4, 1
$$;

-- Bilan des compétences : niveau proposé = moyenne arrondie des niveaux saisis ; le bilan corrigé l'emporte.
create function public.bilan_competences(p_classe uuid, p_periode uuid default null)
returns table (eleve_id uuid, competence_id uuid, nb int, moyenne numeric,
               niveau_propose smallint, niveau_retenu smallint, modifie boolean)
language sql stable security definer set search_path = public as $$
  with a as (
    select ac.eleve_id, ac.competence_id, count(*)::int as nb, avg(ac.niveau) as m
    from acquisitions ac
    join evaluations ev on ev.id = ac.evaluation_id
    join enseignements en on en.id = ev.enseignement_id and en.classe_id = p_classe
    join eleves e on e.id = ac.eleve_id and e.classe_id = p_classe and e.deleted_at is null
    where p_periode is null or ev.periode_id = p_periode
    group by ac.eleve_id, ac.competence_id),
  o as (
    select b.eleve_id, b.competence_id, b.niveau
    from bilans_competences b
    join eleves e on e.id = b.eleve_id and e.classe_id = p_classe and e.deleted_at is null
    where p_periode is not null and b.periode_id = p_periode)
  select coalesce(a.eleve_id, o.eleve_id), coalesce(a.competence_id, o.competence_id),
         coalesce(a.nb, 0), round(a.m, 2), round(a.m)::smallint,
         coalesce(o.niveau, round(a.m)::smallint), o.niveau is not null
  from a full join o on o.eleve_id = a.eleve_id and o.competence_id = a.competence_id
  where public.voit_toute_la_classe(p_classe)
$$;

-- ---------- Droits sur les fonctions ----------
revoke all on function
  public.periode_est_verrouillee(uuid), public.peut_noter(uuid), public.peut_noter_eval(uuid), public.peut_bilan(uuid), public.voit_toute_la_classe(uuid), public.voit_notes_ens(uuid), public.voit_notes_eval(uuid), public.voit_bilan_eleve(uuid),
  public.saisir_notes(uuid, jsonb), public.saisir_acquisitions(uuid, jsonb),
  public.calcul_moyennes_ens(uuid, uuid), public.moyennes_matieres(uuid, uuid), public.moyennes_generales(uuid, uuid),
  public.bilan_competences(uuid, uuid) from public, anon, authenticated;
grant execute on function
  public.periode_est_verrouillee(uuid), public.peut_noter(uuid), public.peut_noter_eval(uuid), public.peut_bilan(uuid), public.voit_toute_la_classe(uuid), public.voit_notes_ens(uuid), public.voit_notes_eval(uuid), public.voit_bilan_eleve(uuid),
  public.saisir_notes(uuid, jsonb), public.saisir_acquisitions(uuid, jsonb),
  public.moyennes_matieres(uuid, uuid), public.moyennes_generales(uuid, uuid), public.bilan_competences(uuid, uuid) to authenticated;
-- calcul_moyennes_ens reste interne : appelée seulement par les fonctions ci-dessus.
