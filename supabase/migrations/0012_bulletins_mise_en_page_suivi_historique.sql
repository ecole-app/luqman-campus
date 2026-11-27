-- Luqmân Campus — étape 4, compléments :
--  * mise en page des bulletins réglable par la direction (réglage par défaut) ;
--  * tableau de remplissage de toutes les classes (direction) ;
--  * historique des appréciations (qui a écrit / modifié quoi, quand).

-- ---------- Mise en page par défaut ----------
insert into public.parametres(cle, valeur, description) values
 ('bulletin_mise_en_page', 'null', 'Mise en page des bulletins : ordre et visibilité des blocs et des colonnes (null = mise en page standard)')
on conflict (cle) do nothing;

-- ---------- Tableau de remplissage : toutes les classes (direction) ----------
create function public.suivi_toutes_classes(p_periode uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.est_admin() then null else coalesce((select jsonb_agg(x order by x->>'classe') from (
    select jsonb_build_object(
      'classe_id', c.id, 'classe', c.nom,
      'prof_principal', (select p.prenom || ' ' || p.nom from profils p where p.id = c.prof_principal_id),
      'eleves', (select count(*) from eleves e where e.classe_id = c.id and e.deleted_at is null),
      'generales', (select count(*) from appreciations_generales ag join eleves e on e.id = ag.eleve_id
                    where e.classe_id = c.id and e.deleted_at is null and ag.periode_id = p_periode and coalesce(btrim(ag.texte), '') <> ''),
      'statut', coalesce((select statut from bulletins_periode b where b.classe_id = c.id and b.periode_id = p_periode), 'ouvert'),
      'matieres', coalesce((select jsonb_agg(jsonb_build_object(
          'enseignement_id', en.id, 'matiere', m.nom,
          'professeur', (select p.prenom || ' ' || p.nom from profils p where p.id = en.professeur_id),
          'appreciations', (select count(*) from appreciations a join eleves e on e.id = a.eleve_id
                            where a.enseignement_id = en.id and a.periode_id = p_periode and e.deleted_at is null),
          'elements', exists (select 1 from elements_programme ep where ep.enseignement_id = en.id and ep.periode_id = p_periode))
        order by m.nom) from enseignements en join matieres m on m.id = en.matiere_id where en.classe_id = c.id), '[]'::jsonb)
    ) x from classes c where c.annee_id = (select annee_id from periodes where id = p_periode)) t), '[]'::jsonb) end
$$;

-- ---------- Historique des appréciations d'un élève dans une matière ----------
create function public.historique_appreciations(p_eleve uuid, p_ens uuid, p_periode uuid)
returns table (horodatage timestamptz, auteur text, operation text, avant text, apres text)
language sql stable security definer set search_path = public as $$
  select j.horodatage,
         coalesce((select p.prenom || ' ' || p.nom from public.profils p where p.id = j.auteur), 'Système'),
         j.operation, j.avant->>'texte', j.apres->>'texte'
  from public.journal_audit j
  where j.table_nom = 'appreciations'
    and coalesce(j.apres, j.avant)->>'eleve_id' = p_eleve::text
    and coalesce(j.apres, j.avant)->>'enseignement_id' = p_ens::text
    and coalesce(j.apres, j.avant)->>'periode_id' = p_periode::text
    and public.voit_notes_ens(p_ens)
  order by j.horodatage desc, j.id desc
$$;

revoke all on function public.suivi_toutes_classes(uuid), public.historique_appreciations(uuid, uuid, uuid) from public, anon;
grant execute on function public.suivi_toutes_classes(uuid), public.historique_appreciations(uuid, uuid, uuid) to authenticated;
