-- Luqmân Campus — étape 1 : données de l'établissement
-- Année scolaire, périodes, classes, élèves, matières, enseignements, import CSV des élèves.
-- Données fictives uniquement tant que l'étape 0b (déploiement) n'est pas faite.

-- ---------- Tables ----------
create table public.annees_scolaires (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique,                 -- ex. « 2026-2027 »
  debut date not null,
  fin date not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fin > debut)
);
-- une seule année active à la fois
create unique index une_seule_annee_active on public.annees_scolaires (active) where active;

create table public.periodes (
  id uuid primary key default gen_random_uuid(),
  annee_id uuid not null references public.annees_scolaires(id) on delete cascade,
  numero smallint not null check (numero between 1 and 3),
  libelle text not null,                        -- ex. « Trimestre 1 »
  debut date not null,
  fin date not null,
  verrouillee boolean not null default false,   -- utilisé à l'étape 3 (notes)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (annee_id, numero),
  check (fin > debut)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  annee_id uuid not null references public.annees_scolaires(id) on delete cascade,
  niveau text not null check (niveau in ('6e','5e','4e','3e')),
  nom text not null,                            -- ex. « 5e A »
  prof_principal_id uuid references public.profils(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (annee_id, nom)
);

create table public.eleves (
  id uuid primary key default gen_random_uuid(),
  ine text unique check (ine ~ '^[0-9A-Z]{11}$'),   -- identifiant national, 11 caractères
  nom text not null,
  prenom text not null,
  date_naissance date not null,
  classe_id uuid references public.classes(id),
  profil_id uuid unique references public.profils(id),  -- compte de l'élève (phase 2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                         -- suppression logique
);
create index eleves_classe on public.eleves (classe_id) where deleted_at is null;

create table public.matieres (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- ex. « EPS »
  nom text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un enseignement = une matière enseignée à une classe par un professeur
create table public.enseignements (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  matiere_id uuid not null references public.matieres(id),
  professeur_id uuid references public.profils(id),
  coefficient numeric(4,2) not null default 1 check (coefficient > 0),
  heures_hebdo numeric(4,2) check (heures_hebdo > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classe_id, matiere_id, professeur_id)
);

-- ---------- Horodatage serveur et journal d'audit (comme à l'étape 0a) ----------
do $$
declare t text;
begin
  foreach t in array array['annees_scolaires','periodes','classes','eleves','matieres','enseignements'] loop
    execute format('create trigger horodater_%1$s before insert or update on public.%1$s
                    for each row execute function public.horodater()', t);
    execute format('create trigger auditer_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.auditer()', t);
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;

-- ---------- Droits (RLS) ----------
-- Le personnel lit tout ; l'administration et la direction écrivent.
-- Un élève ne lit que sa propre fiche (via son compte), jamais celle des autres.
do $$
declare t text;
begin
  foreach t in array array['annees_scolaires','periodes','classes','matieres','enseignements'] loop
    execute format('create policy %1$s_lecture on public.%1$s for select using (public.est_personnel())', t);
    execute format('create policy %1$s_ecriture on public.%1$s for all
                    using (public.est_admin()) with check (public.est_admin())', t);
  end loop;
end $$;

create policy eleves_lecture on public.eleves for select
  using (public.est_personnel() or profil_id = auth.uid());
create policy eleves_ecriture on public.eleves for all
  using (public.est_admin()) with check (public.est_admin());

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.annees_scolaires, public.periodes, public.classes,
  public.eleves, public.matieres, public.enseignements to authenticated;

-- ---------- Import CSV des élèves ----------
-- Le navigateur lit le fichier CSV et envoie les lignes en JSON :
-- [{"nom":"...","prenom":"...","naissance":"2013-04-02","ine":"...","classe":"5e A"}, ...]
-- 1) controler_import_eleves : ne modifie RIEN, renvoie toutes les erreurs ligne par ligne.
-- 2) importer_eleves : refuse tout s'il y a une seule erreur ; sinon écrit tout d'un bloc.
create function public.controler_import_eleves(lignes jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  l jsonb; i int := 0; erreurs jsonb := '[]'::jsonb;
  v_nom text; v_prenom text; v_nais text; v_ine text; v_classe text; d date;
  vus_ine text[] := '{}'; vus_ident text[] := '{}'; ident text;
  annee uuid;
begin
  if not public.est_admin() then
    raise exception 'Droits insuffisants pour importer des élèves';
  end if;
  if jsonb_typeof(lignes) <> 'array' or jsonb_array_length(lignes) = 0 then
    return jsonb_build_object('ok', false, 'nb', 0,
      'erreurs', jsonb_build_array(jsonb_build_object('ligne', 0, 'champ', 'fichier', 'message', 'Le fichier est vide')));
  end if;
  select id into annee from annees_scolaires where active;
  if annee is null then
    return jsonb_build_object('ok', false, 'nb', jsonb_array_length(lignes),
      'erreurs', jsonb_build_array(jsonb_build_object('ligne', 0, 'champ', 'année', 'message', 'Aucune année scolaire active')));
  end if;

  for l in select * from jsonb_array_elements(lignes) loop
    i := i + 1;
    v_nom := nullif(btrim(l->>'nom'), '');
    v_prenom := nullif(btrim(l->>'prenom'), '');
    v_nais := nullif(btrim(l->>'naissance'), '');
    v_ine := nullif(upper(btrim(coalesce(l->>'ine',''))), '');
    v_classe := nullif(btrim(l->>'classe'), '');

    if v_nom is null then erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'nom', 'message', 'Nom manquant'); end if;
    if v_prenom is null then erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'prenom', 'message', 'Prénom manquant'); end if;

    d := null;
    if v_nais is null then
      erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'naissance', 'message', 'Date de naissance manquante');
    elsif v_nais !~ '^\d{4}-\d{2}-\d{2}$' then
      erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'naissance', 'message', 'Date au mauvais format (attendu AAAA-MM-JJ)');
    else
      begin d := v_nais::date;
      exception when others then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'naissance', 'message', 'Date impossible');
      end;
      if d is not null and (d < date '2000-01-01' or d > current_date) then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'naissance', 'message', 'Date de naissance peu vraisemblable');
      end if;
    end if;

    if v_ine is not null then
      if v_ine !~ '^[0-9A-Z]{11}$' then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'ine', 'message', 'INE invalide (11 caractères, chiffres et lettres)');
      elsif v_ine = any(vus_ine) then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'ine', 'message', 'INE en double dans le fichier');
      elsif exists (select 1 from eleves where ine = v_ine and deleted_at is null) then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'ine', 'message', 'INE déjà présent dans la base');
      end if;
      vus_ine := vus_ine || v_ine;
    end if;

    if v_classe is null then
      erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'classe', 'message', 'Classe manquante');
    elsif not exists (select 1 from classes where annee_id = annee and nom = v_classe) then
      erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'classe', 'message', 'Classe inconnue : ' || v_classe);
    end if;

    if v_nom is not null and v_prenom is not null and d is not null then
      ident := lower(v_nom) || '|' || lower(v_prenom) || '|' || d::text;
      if ident = any(vus_ident) then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'nom', 'message', 'Élève en double dans le fichier');
      elsif exists (select 1 from eleves where lower(nom) = lower(v_nom) and lower(prenom) = lower(v_prenom)
                    and date_naissance = d and deleted_at is null) then
        erreurs := erreurs || jsonb_build_object('ligne', i, 'champ', 'nom', 'message', 'Élève déjà présent dans la base');
      end if;
      vus_ident := vus_ident || ident;
    end if;
  end loop;

  return jsonb_build_object('ok', jsonb_array_length(erreurs) = 0, 'nb', i, 'erreurs', erreurs);
end $$;

create function public.importer_eleves(lignes jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare ctrl jsonb; annee uuid; nb int;
begin
  ctrl := public.controler_import_eleves(lignes);   -- vérifie aussi les droits
  if not (ctrl->>'ok')::boolean then
    return ctrl || jsonb_build_object('importes', 0);   -- rien n'est écrit
  end if;
  select id into annee from annees_scolaires where active;
  insert into eleves (nom, prenom, date_naissance, ine, classe_id)
  select btrim(l->>'nom'), btrim(l->>'prenom'), (btrim(l->>'naissance'))::date,
         nullif(upper(btrim(coalesce(l->>'ine',''))), ''),
         (select c.id from classes c where c.annee_id = annee and c.nom = btrim(l->>'classe'))
  from jsonb_array_elements(lignes) l;
  get diagnostics nb = row_count;
  return ctrl || jsonb_build_object('importes', nb);
end $$;

revoke all on function public.controler_import_eleves(jsonb), public.importer_eleves(jsonb) from public, anon;
grant execute on function public.controler_import_eleves(jsonb), public.importer_eleves(jsonb) to authenticated;
