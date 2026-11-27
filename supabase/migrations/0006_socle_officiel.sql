-- Luqmân Campus — socle commun : libellés officiels et source affichée.
-- Source : décret n° 2015-372 du 31 mars 2015 (JO du 2 avril 2015), Bulletin officiel n° 17 du 23 avril 2015,
-- art. D.122-1 à D.122-3 et annexe (domaines et objectifs). 8 composantes évaluées sur 4 niveaux de maîtrise.
-- Une compétence ajoutée par le collège (non officielle) reste possible mais est marquée comme telle.

alter table public.competences
  add column officiel boolean not null default false,
  add column source_ref text,
  add column source_url text;

do $$
declare
  ref constant text := 'Décret n° 2015-372 du 31-3-2015, BO n° 17 du 23-4-2015 (art. D.122-1 à D.122-3 et annexe)';
  url constant text := 'https://www.education.gouv.fr/bo/15/Hebdo17/MENE1506516D.htm';
begin
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 1 : les langages pour penser et communiquer',
    libelle = 'Comprendre, s''exprimer en utilisant la langue française à l''oral et à l''écrit'
  where code = 'D1.1' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 1 : les langages pour penser et communiquer',
    libelle = 'Comprendre, s''exprimer en utilisant une langue étrangère et, le cas échéant, une langue régionale'
  where code = 'D1.2' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 1 : les langages pour penser et communiquer',
    libelle = 'Comprendre, s''exprimer en utilisant les langages mathématiques, scientifiques et informatiques'
  where code = 'D1.3' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 1 : les langages pour penser et communiquer',
    libelle = 'Comprendre, s''exprimer en utilisant les langages des arts et du corps'
  where code = 'D1.4' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 2 : les méthodes et outils pour apprendre', libelle = 'Les méthodes et outils pour apprendre'
  where code = 'D2' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 3 : la formation de la personne et du citoyen', libelle = 'La formation de la personne et du citoyen'
  where code = 'D3' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 4 : les systèmes naturels et les systèmes techniques', libelle = 'Les systèmes naturels et les systèmes techniques'
  where code = 'D4' and cycle in (3, 4);
  update public.competences set officiel = true, source_ref = ref, source_url = url,
    domaine = 'Domaine 5 : les représentations du monde et l''activité humaine', libelle = 'Les représentations du monde et l''activité humaine'
  where code = 'D5' and cycle in (3, 4);
end $$;

-- Les lignes officielles ne se modifient pas ; seule la direction ajoute une compétence locale (officiel = faux).
create function public.competence_officielle_protegee() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.officiel then raise exception 'Une compétence officielle du socle ne se supprime pas (désactivez-la si besoin).'; end if;
  if tg_op = 'INSERT' then new.officiel := false; new.source_ref := null; new.source_url := null; end if;
  if tg_op = 'UPDATE' and old.officiel and (new.code, new.libelle, new.domaine, new.cycle, new.officiel, new.source_ref, new.source_url)
        is distinct from (old.code, old.libelle, old.domaine, old.cycle, old.officiel, old.source_ref, old.source_url) then
    raise exception 'Le texte d''une compétence officielle du socle ne se modifie pas (seul son état actif/désactivé change).';
  end if;
  return coalesce(new, old);
end $$;
create trigger competence_officielle before insert or update or delete on public.competences
  for each row execute function public.competence_officielle_protegee();
