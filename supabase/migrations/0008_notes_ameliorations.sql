-- Luqmân Campus — étape 3, compléments : historique des notes, copie d'une évaluation, bibliothèque entre professeurs.
-- Les modèles de la bibliothèque sont des contenus de professeurs : ils ne sont PAS des textes officiels.

-- ---------- Historique des notes d'une évaluation ----------
-- Qui a saisi, modifié ou effacé quelle note, et quand. Visible par ceux qui voient les notes de l'évaluation.
create function public.historique_notes(p_eval uuid)
returns table (horodatage timestamptz, auteur text, operation text, eleve_id uuid,
               avant_valeur numeric, avant_statut text, apres_valeur numeric, apres_statut text, commentaire text)
language sql stable security definer set search_path = public as $$
  select j.horodatage,
         coalesce((select p.prenom || ' ' || p.nom from public.profils p where p.id = j.auteur), 'Système'),
         j.operation,
         (coalesce(j.apres, j.avant)->>'eleve_id')::uuid,
         (j.avant->>'valeur')::numeric, j.avant->>'statut',
         (j.apres->>'valeur')::numeric, j.apres->>'statut',
         j.apres->>'commentaire'
  from public.journal_audit j
  where j.table_nom = 'notes'
    and coalesce(j.apres, j.avant)->>'evaluation_id' = p_eval::text
    and public.voit_notes_eval(p_eval)
  order by j.horodatage desc, j.id desc
$$;

-- ---------- Copie d'une évaluation vers une autre classe / matière ----------
-- Recrée l'évaluation (titre, type, barème, coefficient, compétences visées de même code) sans les notes.
create function public.copier_evaluation(p_eval uuid, p_enseignement uuid, p_date date default current_date)
returns uuid language plpgsql set search_path = public as $$
declare src public.evaluations; neuf uuid := gen_random_uuid(); cy smallint;
begin
  select * into src from public.evaluations where id = p_eval;
  if src.id is null then raise exception 'Évaluation introuvable'; end if;
  if not public.peut_noter(p_enseignement) then raise exception 'Tu ne peux pas créer d''évaluation sur cet enseignement'; end if;
  insert into public.evaluations(id, enseignement_id, titre, date_eval, type, bareme, coefficient)
  values (neuf, p_enseignement, src.titre, p_date, src.type, src.bareme, src.coefficient);
  select public.cycle_du_niveau(c.niveau) into cy from public.enseignements e join public.classes c on c.id = e.classe_id where e.id = p_enseignement;
  insert into public.evaluation_competences(evaluation_id, competence_id)
  select neuf, c2.id
  from public.evaluation_competences ec
  join public.competences c1 on c1.id = ec.competence_id
  join public.competences c2 on c2.code = c1.code and c2.cycle = cy and c2.actif
  where ec.evaluation_id = p_eval;
  return neuf;
end $$;

-- ---------- Bibliothèque d'évaluations entre professeurs ----------
create table public.modeles_evaluation (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (length(btrim(titre)) > 0),
  description text,
  type text not null default 'devoir',
  bareme numeric not null check (bareme > 0),
  coefficient numeric not null default 1 check (coefficient > 0),
  matiere_id uuid references public.matieres(id) on delete set null,
  niveau text,
  competences_codes text[] not null default '{}',
  partage boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.modeles_evaluation enable row level security;
create trigger horodater_modeles_evaluation before insert or update on public.modeles_evaluation
  for each row execute function public.horodater();
create trigger auditer_modeles_evaluation after insert or update or delete on public.modeles_evaluation
  for each row execute function public.auditer();
create policy modeles_lecture on public.modeles_evaluation for select
  using (public.est_personnel() and (partage or created_by = auth.uid() or public.est_admin()));
create policy modeles_ecriture on public.modeles_evaluation for all
  using (created_by = auth.uid() or public.est_admin()) with check (created_by = auth.uid() or public.est_admin());

-- Publier une évaluation existante dans la bibliothèque (réservé à qui peut la noter).
create function public.publier_modele(p_eval uuid, p_description text default null, p_partage boolean default true)
returns uuid language plpgsql set search_path = public as $$
declare src public.evaluations; mat uuid; niv text; neuf uuid;
begin
  select * into src from public.evaluations where id = p_eval;
  if src.id is null then raise exception 'Évaluation introuvable'; end if;
  if not public.peut_noter(src.enseignement_id) then raise exception 'Tu ne peux publier que tes propres évaluations'; end if;
  select e.matiere_id, c.niveau into mat, niv from public.enseignements e join public.classes c on c.id = e.classe_id where e.id = src.enseignement_id;
  insert into public.modeles_evaluation(titre, description, type, bareme, coefficient, matiere_id, niveau, competences_codes, partage)
  values (src.titre, nullif(btrim(coalesce(p_description, '')), ''), src.type, src.bareme, src.coefficient, mat, niv,
          coalesce((select array_agg(distinct c.code order by c.code) from public.evaluation_competences ec join public.competences c on c.id = ec.competence_id where ec.evaluation_id = p_eval), '{}'),
          p_partage)
  returning id into neuf;
  return neuf;
end $$;

-- Utiliser un modèle : crée l'évaluation (sans notes) dans un enseignement qu'on peut noter.
create function public.utiliser_modele(p_modele uuid, p_enseignement uuid, p_date date default current_date)
returns uuid language plpgsql set search_path = public as $$
declare m public.modeles_evaluation; neuf uuid := gen_random_uuid(); cy smallint;
begin
  select * into m from public.modeles_evaluation where id = p_modele;
  if m.id is null then raise exception 'Modèle introuvable ou non partagé'; end if;
  if not public.peut_noter(p_enseignement) then raise exception 'Tu ne peux pas créer d''évaluation sur cet enseignement'; end if;
  insert into public.evaluations(id, enseignement_id, titre, date_eval, type, bareme, coefficient)
  values (neuf, p_enseignement, m.titre, p_date, m.type, m.bareme, m.coefficient);
  select public.cycle_du_niveau(c.niveau) into cy from public.enseignements e join public.classes c on c.id = e.classe_id where e.id = p_enseignement;
  insert into public.evaluation_competences(evaluation_id, competence_id)
  select neuf, c2.id from public.competences c2 where c2.cycle = cy and c2.actif and c2.code = any(m.competences_codes);
  return neuf;
end $$;

revoke all on function public.historique_notes(uuid), public.copier_evaluation(uuid, uuid, date),
  public.publier_modele(uuid, text, boolean), public.utiliser_modele(uuid, uuid, date) from public, anon;
grant execute on function public.historique_notes(uuid), public.copier_evaluation(uuid, uuid, date),
  public.publier_modele(uuid, text, boolean), public.utiliser_modele(uuid, uuid, date) to authenticated;
revoke all on public.modeles_evaluation from anon;
grant select, insert, update, delete on public.modeles_evaluation to authenticated;
