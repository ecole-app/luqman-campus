-- Luqmân Campus — étape 4 : appréciations et bulletins (bilans périodiques).
-- Contenu calqué sur le bilan périodique du livret scolaire (arrêté du 31-12-2015, NOR MENE1531425A) :
-- pour chaque enseignement, les principaux éléments du programme travaillés, la note (positionnement) et une
-- appréciation (acquisitions, progrès, difficultés) ; la vie scolaire (assiduité, ponctualité) ; une appréciation générale.
-- Données fictives uniquement tant que l'étape 0b n'est pas faite.

-- ---------- Réglages ----------
insert into public.parametres(cle, valeur, description) values
 ('etablissement_nom', '"Collège Luqmân"', 'Nom de l''établissement en tête des bulletins'),
 ('etablissement_adresse', '"Saint-Étienne"', 'Adresse de l''établissement en tête des bulletins'),
 ('appreciation_longueur_max', '400', 'Nombre maximum de caractères d''une appréciation'),
 ('elements_programme_longueur_max', '600', 'Nombre maximum de caractères des éléments du programme travaillés'),
 ('mentions_bulletin', '["Éloges","Félicitations","Compliments","Encouragements","Avertissement travail","Avertissement comportement","Avertissement assiduité"]',
  'Mentions possibles sur le bulletin (décidées en conseil de classe)')
on conflict (cle) do nothing;

-- ---------- Tables ----------
create table public.appreciations (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  enseignement_id uuid not null references public.enseignements(id) on delete cascade,
  periode_id uuid not null references public.periodes(id) on delete cascade,
  texte text not null check (length(btrim(texte)) > 0),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, enseignement_id, periode_id)
);
create table public.elements_programme (
  id uuid primary key default gen_random_uuid(),
  enseignement_id uuid not null references public.enseignements(id) on delete cascade,
  periode_id uuid not null references public.periodes(id) on delete cascade,
  texte text not null check (length(btrim(texte)) > 0),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enseignement_id, periode_id)
);
create table public.appreciations_generales (
  id uuid primary key default gen_random_uuid(),
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  periode_id uuid not null references public.periodes(id) on delete cascade,
  texte text,
  mention text,
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eleve_id, periode_id),
  check (coalesce(btrim(texte), '') <> '' or mention is not null)
);
create table public.bulletins_periode (
  classe_id uuid not null references public.classes(id) on delete cascade,
  periode_id uuid not null references public.periodes(id) on delete cascade,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'valide', 'publie')),
  valide_par uuid, valide_le timestamptz, publie_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (classe_id, periode_id)
);
create table public.banque_phrases (
  id uuid primary key default gen_random_uuid(),
  categorie text not null default 'Divers',
  texte text not null check (length(btrim(texte)) > 0),
  partage boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Règles côté serveur ----------
-- Bulletin validé/publié ou période verrouillée : seule l'administration modifie. Longueur maximale. Élève de la classe.
create function public.appreciation_regles() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; per uuid; cl uuid; st text; maxl int; ments jsonb;
begin
  if tg_op = 'DELETE' then j := to_jsonb(old); else j := to_jsonb(new); end if;
  per := (j->>'periode_id')::uuid;
  if tg_table_name = 'appreciations_generales' then
    select classe_id into cl from eleves where id = (j->>'eleve_id')::uuid;
  else
    select classe_id into cl from enseignements where id = (j->>'enseignement_id')::uuid;
  end if;
  st := coalesce((select statut from bulletins_periode where classe_id = cl and periode_id = per), 'ouvert');
  if (st <> 'ouvert' or public.periode_est_verrouillee(per)) and not public.est_admin() then
    raise exception 'Bulletin validé ou période verrouillée : seule la direction peut encore modifier.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name = 'appreciations' and not exists (select 1 from eleves e where e.id = (j->>'eleve_id')::uuid and e.classe_id = cl and e.deleted_at is null) then
    raise exception 'Cet élève n''est pas dans la classe de cet enseignement.';
  end if;
  maxl := coalesce((select (valeur #>> '{}')::int from parametres
                    where cle = case when tg_table_name = 'elements_programme' then 'elements_programme_longueur_max' else 'appreciation_longueur_max' end),
                   case when tg_table_name = 'elements_programme' then 600 else 400 end);
  if length(coalesce(j->>'texte', '')) > maxl then
    raise exception 'Texte trop long : % caractères maximum (actuellement %).', maxl, length(j->>'texte');
  end if;
  if tg_table_name = 'appreciations_generales' and (j->>'mention') is not null then
    ments := coalesce((select valeur from parametres where cle = 'mentions_bulletin'), '[]'::jsonb);
    if not ments ? (j->>'mention') then raise exception 'Mention inconnue : %', j->>'mention'; end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['appreciations', 'elements_programme', 'appreciations_generales'] loop
    execute format('create trigger regles_%1$s before insert or update or delete on public.%1$s
                    for each row execute function public.appreciation_regles()', t);
  end loop;
  foreach t in array array['appreciations', 'elements_programme', 'appreciations_generales', 'bulletins_periode', 'banque_phrases'] loop
    execute format('create trigger horodater_%1$s before insert or update on public.%1$s
                    for each row execute function public.horodater()', t);
    execute format('create trigger auditer_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.auditer()', t);
    execute format('alter table public.%1$s enable row level security', t);
  end loop;
end $$;

-- ---------- Droits (RLS) ----------
-- Appréciation d'une matière : lue par qui voit les notes de cette matière ; écrite par son professeur ou l'administration.
create policy appreciations_lecture on public.appreciations for select using (public.voit_notes_ens(enseignement_id));
create policy appreciations_ecriture on public.appreciations for all
  using (public.peut_noter(enseignement_id)) with check (public.peut_noter(enseignement_id));
-- Éléments du programme travaillés : pas de donnée personnelle, lisibles par tout le personnel.
create policy elements_programme_lecture on public.elements_programme for select using (public.est_personnel());
create policy elements_programme_ecriture on public.elements_programme for all
  using (public.peut_noter(enseignement_id)) with check (public.peut_noter(enseignement_id));
-- Appréciation générale et mention : professeur principal de la classe ou administration.
create policy appreciations_generales_lecture on public.appreciations_generales for select using (public.voit_bilan_eleve(eleve_id));
create policy appreciations_generales_ecriture on public.appreciations_generales for all
  using (public.peut_bilan(eleve_id)) with check (public.peut_bilan(eleve_id));
create policy bulletins_periode_lecture on public.bulletins_periode for select using (public.est_personnel());
create policy bulletins_periode_ecriture on public.bulletins_periode for all using (public.est_admin()) with check (public.est_admin());
create policy banque_phrases_lecture on public.banque_phrases for select
  using (public.est_personnel() and (partage or created_by = auth.uid() or public.est_admin()));
create policy banque_phrases_ecriture on public.banque_phrases for all
  using (created_by = auth.uid() or public.est_admin()) with check (created_by = auth.uid() or public.est_admin());

-- ---------- Banque de phrases de départ (formulations génériques, modifiables) ----------
insert into public.banque_phrases(categorie, texte, created_by) values
 ('Très bien', 'Excellent trimestre : travail sérieux et résultats remarquables.', null),
 ('Très bien', 'Très bon ensemble, porté par une participation active et un travail régulier.', null),
 ('Très bien', 'Des acquis solides et une grande rigueur. Continuez ainsi.', null),
 ('Satisfaisant', 'Bon trimestre. Le travail est régulier et les résultats satisfaisants.', null),
 ('Satisfaisant', 'Ensemble satisfaisant. Davantage de participation orale permettrait d''aller plus loin.', null),
 ('Satisfaisant', 'Résultats corrects ; les méthodes de travail sont à consolider.', null),
 ('Progrès', 'Des progrès nets ce trimestre : les efforts fournis portent leurs fruits.', null),
 ('Progrès', 'En progrès. Il faut maintenir cette dynamique.', null),
 ('Encouragements', 'Des efforts visibles qu''il faut poursuivre avec régularité.', null),
 ('Encouragements', 'Les bases sont là ; avec un travail plus régulier, les résultats suivront.', null),
 ('Difficultés', 'Des difficultés persistent. Un travail plus régulier et des questions en classe sont nécessaires.', null),
 ('Difficultés', 'Les notions essentielles ne sont pas encore acquises. Il faut reprendre les leçons régulièrement.', null),
 ('Difficultés', 'Trimestre difficile. Il est indispensable de se mettre au travail dès maintenant.', null),
 ('Travail personnel', 'Le travail personnel doit être plus régulier.', null),
 ('Travail personnel', 'Attention aux devoirs non rendus.', null),
 ('Travail personnel', 'Les leçons doivent être apprises avec plus de sérieux.', null),
 ('Participation', 'Participation active et pertinente.', null),
 ('Participation', 'Il faut oser participer davantage à l''oral.', null),
 ('Comportement', 'Attitude sérieuse et agréable en classe.', null),
 ('Comportement', 'Le bavardage nuit à la concentration : plus de sérieux est attendu.', null),
 ('Comportement', 'L''attitude en classe doit nettement s''améliorer.', null),
 ('Assiduité', 'Les absences répétées pénalisent les apprentissages.', null),
 ('Assiduité', 'La ponctualité doit être améliorée.', null),
 ('Conseil', 'Continuez vos efforts au prochain trimestre.', null);

-- ---------- Saisie ----------
-- Appréciations d'une matière pour une période (lot) ; texte vide = suppression. Mêmes règles et droits que la table.
create function public.saisir_appreciations(p_ens uuid, p_periode uuid, p_lignes jsonb) returns integer
language plpgsql set search_path = public as $$
declare l jsonb; n int := 0; t text; el uuid;
begin
  if jsonb_typeof(p_lignes) <> 'array' then raise exception 'Format de saisie invalide'; end if;
  for l in select * from jsonb_array_elements(p_lignes) loop
    el := (l->>'eleve_id')::uuid; t := btrim(coalesce(l->>'texte', ''));
    if t = '' then
      delete from appreciations where eleve_id = el and enseignement_id = p_ens and periode_id = p_periode;
    else
      insert into appreciations(eleve_id, enseignement_id, periode_id, texte) values (el, p_ens, p_periode, t)
      on conflict (eleve_id, enseignement_id, periode_id) do update set texte = excluded.texte;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.saisir_elements_programme(p_ens uuid, p_periode uuid, p_texte text) returns void
language plpgsql set search_path = public as $$
begin
  if btrim(coalesce(p_texte, '')) = '' then
    delete from elements_programme where enseignement_id = p_ens and periode_id = p_periode;
  else
    insert into elements_programme(enseignement_id, periode_id, texte) values (p_ens, p_periode, btrim(p_texte))
    on conflict (enseignement_id, periode_id) do update set texte = excluded.texte;
  end if;
end $$;

create function public.saisir_appreciation_generale(p_eleve uuid, p_periode uuid, p_texte text, p_mention text default null) returns void
language plpgsql set search_path = public as $$
declare t text := nullif(btrim(coalesce(p_texte, '')), ''); m text := nullif(btrim(coalesce(p_mention, '')), '');
begin
  if t is null and m is null then
    delete from appreciations_generales where eleve_id = p_eleve and periode_id = p_periode;
  else
    insert into appreciations_generales(eleve_id, periode_id, texte, mention) values (p_eleve, p_periode, t, m)
    on conflict (eleve_id, periode_id) do update set texte = excluded.texte, mention = excluded.mention;
  end if;
end $$;

-- Ouvert → validé (saisies figées sauf direction) → publié (prêt pour les familles, phase 2). Réservé à l'administration.
create function public.changer_statut_bulletin(p_classe uuid, p_periode uuid, p_statut text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'Seule la direction valide ou publie les bulletins.'; end if;
  if p_statut not in ('ouvert', 'valide', 'publie') then raise exception 'Statut inconnu'; end if;
  insert into bulletins_periode(classe_id, periode_id, statut, valide_par, valide_le, publie_le)
  values (p_classe, p_periode, p_statut,
          case when p_statut <> 'ouvert' then auth.uid() end, case when p_statut <> 'ouvert' then now() end,
          case when p_statut = 'publie' then now() end)
  on conflict (classe_id, periode_id) do update set statut = excluded.statut,
    valide_par = case when excluded.statut = 'ouvert' then null else coalesce(bulletins_periode.valide_par, excluded.valide_par) end,
    valide_le = case when excluded.statut = 'ouvert' then null else coalesce(bulletins_periode.valide_le, excluded.valide_le) end,
    publie_le = excluded.publie_le;
end $$;

-- ---------- Suivi du remplissage (compteurs seulement) ----------
create function public.suivi_appreciations(p_classe uuid, p_periode uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.est_personnel() then null else jsonb_build_object(
    'eleves', (select count(*) from eleves where classe_id = p_classe and deleted_at is null),
    'generales', (select count(*) from appreciations_generales ag join eleves e on e.id = ag.eleve_id
                  where e.classe_id = p_classe and e.deleted_at is null and ag.periode_id = p_periode and coalesce(btrim(ag.texte), '') <> ''),
    'statut', coalesce((select statut from bulletins_periode where classe_id = p_classe and periode_id = p_periode), 'ouvert'),
    'matieres', coalesce((select jsonb_agg(jsonb_build_object(
        'enseignement_id', en.id, 'matiere', m.nom,
        'professeur', (select p.prenom || ' ' || p.nom from profils p where p.id = en.professeur_id),
        'appreciations', (select count(*) from appreciations a join eleves e on e.id = a.eleve_id
                          where a.enseignement_id = en.id and a.periode_id = p_periode and e.deleted_at is null),
        'elements', exists (select 1 from elements_programme ep where ep.enseignement_id = en.id and ep.periode_id = p_periode))
      order by m.nom) from enseignements en join matieres m on m.id = en.matiere_id where en.classe_id = p_classe), '[]'::jsonb)) end
$$;

-- ---------- Données complètes des bulletins d'une classe pour une période ----------
-- Réservé à qui voit toute la classe (professeur principal, direction, ou tout le personnel si le réglage l'ouvre).
create function public.donnees_bulletins(p_classe uuid, p_periode uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare per public.periodes; cl public.classes; midi time; rang boolean; res jsonb;
begin
  if not public.voit_toute_la_classe(p_classe) then
    raise exception 'Les bulletins sont réservés au professeur principal et à la direction.';
  end if;
  select * into per from periodes where id = p_periode;
  select * into cl from classes where id = p_classe;
  if per.id is null or cl.id is null then raise exception 'Classe ou période introuvable'; end if;
  midi := coalesce((select (valeur #>> '{}')::time from parametres where cle = 'heure_fin_matinee'), time '12:30');
  rang := coalesce((select (valeur #>> '{}')::boolean from parametres where cle = 'bulletin_afficher_rang'), true);  -- réglage créé à l'étape 1

  with mm as (select * from public.calcul_moyennes_ens(p_classe, p_periode)),
  st as (select enseignement_id, avg(moy) a, min(moy) mi, max(moy) ma from mm where moy is not null group by enseignement_id),
  gen as (select x.eleve_id, sum(x.moy * en.coefficient) / sum(en.coefficient) m
          from mm x join enseignements en on en.id = x.enseignement_id where x.moy is not null group by x.eleve_id),
  genr as (select eleve_id, round(m, 2) m, (rank() over (order by round(m, 2) desc))::int rg from gen),
  ab as (select pr.eleve_id,
            count(distinct ((c.debut at time zone 'Europe/Paris')::date::text || case when (c.debut at time zone 'Europe/Paris')::time < midi then 'M' else 'A' end))
              filter (where pr.statut = 'absent') dj,
            count(distinct ((c.debut at time zone 'Europe/Paris')::date::text || case when (c.debut at time zone 'Europe/Paris')::time < midi then 'M' else 'A' end))
              filter (where pr.statut = 'absent' and not pr.justifiee) djnj,
            count(*) filter (where pr.statut = 'retard') ret
         from presences pr join cours c on c.id = pr.cours_id join eleves e on e.id = pr.eleve_id and e.classe_id = p_classe
         where not c.annule and (c.debut at time zone 'Europe/Paris')::date between per.debut and per.fin
         group by pr.eleve_id),
  bc as (select b.eleve_id, jsonb_agg(jsonb_build_object('code', k.code, 'libelle', k.libelle, 'niveau', b.niveau_retenu) order by k.ordre) l
         from public.bilan_competences(p_classe, p_periode) b join competences k on k.id = b.competence_id
         where b.niveau_retenu is not null group by b.eleve_id)
  select jsonb_build_object(
    'etablissement', jsonb_build_object(
       'nom', coalesce((select valeur #>> '{}' from parametres where cle = 'etablissement_nom'), ''),
       'adresse', coalesce((select valeur #>> '{}' from parametres where cle = 'etablissement_adresse'), '')),
    'classe', jsonb_build_object('id', cl.id, 'nom', cl.nom, 'niveau', cl.niveau,
       'prof_principal', (select p.prenom || ' ' || p.nom from profils p where p.id = cl.prof_principal_id)),
    'periode', jsonb_build_object('id', per.id, 'libelle', per.libelle, 'debut', per.debut, 'fin', per.fin,
       'annee', (select libelle from annees_scolaires where id = per.annee_id)),
    'statut', coalesce((select statut from bulletins_periode where classe_id = p_classe and periode_id = p_periode), 'ouvert'),
    'afficher_rang', rang,
    'moyenne_classe', (select round(avg(m), 2) from gen),
    'enseignements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', en.id, 'matiere', m.nom, 'coefficient', en.coefficient,
        'professeur', (select p.prenom || ' ' || p.nom from profils p where p.id = en.professeur_id),
        'elements', ep.texte, 'moyenne_classe', round(s.a, 2), 'min', round(s.mi, 2), 'max', round(s.ma, 2)) order by m.nom)
      from enseignements en join matieres m on m.id = en.matiere_id
      left join elements_programme ep on ep.enseignement_id = en.id and ep.periode_id = p_periode
      left join st s on s.enseignement_id = en.id
      where en.classe_id = p_classe), '[]'::jsonb),
    'eleves', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nom', e.nom, 'prenom', e.prenom, 'date_naissance', e.date_naissance,
        'moyenne', g.m, 'rang', case when rang then g.rg end,
        'resultats', coalesce((select jsonb_object_agg(en.id::text, jsonb_build_object('moyenne', round(x.moy, 2), 'nb', x.nb, 'appreciation', a.texte))
                      from enseignements en
                      left join mm x on x.enseignement_id = en.id and x.eleve_id = e.id
                      left join appreciations a on a.enseignement_id = en.id and a.eleve_id = e.id and a.periode_id = p_periode
                      where en.classe_id = p_classe), '{}'::jsonb),
        'absences', jsonb_build_object('demi_journees', coalesce(ab.dj, 0), 'non_justifiees', coalesce(ab.djnj, 0), 'retards', coalesce(ab.ret, 0)),
        'generale', ag.texte, 'mention', ag.mention,
        'competences', coalesce(bc.l, '[]'::jsonb)) order by e.nom, e.prenom)
      from eleves e
      left join genr g on g.eleve_id = e.id
      left join ab on ab.eleve_id = e.id
      left join bc on bc.eleve_id = e.id
      left join appreciations_generales ag on ag.eleve_id = e.id and ag.periode_id = p_periode
      where e.classe_id = p_classe and e.deleted_at is null), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---------- Droits sur les fonctions ----------
revoke all on function public.appreciation_regles() from public, anon, authenticated;
revoke all on function public.saisir_appreciations(uuid, uuid, jsonb), public.saisir_elements_programme(uuid, uuid, text),
  public.saisir_appreciation_generale(uuid, uuid, text, text), public.changer_statut_bulletin(uuid, uuid, text),
  public.suivi_appreciations(uuid, uuid), public.donnees_bulletins(uuid, uuid) from public, anon;
grant execute on function public.saisir_appreciations(uuid, uuid, jsonb), public.saisir_elements_programme(uuid, uuid, text),
  public.saisir_appreciation_generale(uuid, uuid, text, text), public.changer_statut_bulletin(uuid, uuid, text),
  public.suivi_appreciations(uuid, uuid), public.donnees_bulletins(uuid, uuid) to authenticated;
revoke all on public.appreciations, public.elements_programme, public.appreciations_generales, public.bulletins_periode, public.banque_phrases from anon;
grant select, insert, update, delete on public.appreciations, public.elements_programme, public.appreciations_generales,
  public.bulletins_periode, public.banque_phrases to authenticated;
