-- Retire l'accès libre : retour à la connexion obligatoire et aux droits par rôle (état de 0001 + 0002).
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_un_role(array['administrateur','direction']::public.role_app[])
$$;
create or replace function public.est_personnel() returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_un_role(array['administrateur','direction','vie_scolaire','professeur','professeur_principal']::public.role_app[])
$$;

revoke execute on function public.controler_import_eleves(jsonb), public.importer_eleves(jsonb) from anon;
revoke all on
  public.annees_scolaires, public.periodes, public.classes,
  public.eleves, public.matieres, public.enseignements from anon;

-- ---- Étape 2 : vie scolaire ----
create or replace function public.est_vie_scolaire() returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_un_role(array['administrateur','direction','vie_scolaire']::public.role_app[])
$$;
create or replace function public.peut_appeler(p_cours uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_vie_scolaire()
      or (public.a_un_role(array['professeur','professeur_principal']::public.role_app[])
          and exists (select 1 from public.cours c join public.enseignements e on e.id = c.enseignement_id
                      where c.id = p_cours and (e.professeur_id = auth.uid() or c.remplacant_id = auth.uid())));
end $$;

drop function if exists public.dev_creer_cours_du_jour();
revoke execute on function public.est_vie_scolaire(), public.peut_appeler(uuid) from anon;
revoke execute on function
  public.ouvrir_appel(uuid), public.valider_appel(uuid), public.appels_manquants(),
  public.deposer_telephone(uuid, text), public.restituer_telephone(uuid), public.signaler_non_depot(uuid) from anon;
revoke all on public.cours, public.presences, public.observations, public.punitions, public.appels, public.coffre_telephone from anon;

-- ---- Étape 2 (compléments) ----
revoke execute on function
  public.jour_ferme(date), public.eleves_du_cours(uuid), public.synchroniser_presences(uuid, jsonb),
  public.corriger_presence(uuid, public.statut_presence, text, timestamptz, text, text),
  public.justifier_absences(uuid[], boolean, text, boolean), public.annuler_cours(uuid, boolean, text),
  public.remplacer_cours(uuid, uuid), public.infirmerie_depart(uuid, text, text),
  public.eleves_a_surveiller(), public.stats_absenteisme(date, date) from anon;
revoke all on public.fermetures, public.groupes, public.groupe_eleves, public.absences_prevues, public.corrections_presence,
  public.seances_retenue, public.incidents, public.incident_eleves, public.passages_infirmerie from anon;


-- ---- Étape 3 : notes et compétences ----
create or replace function public.peut_noter(p_enseignement uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or (public.a_un_role(array['professeur','professeur_principal']::public.role_app[])
          and exists (select 1 from public.enseignements e where e.id = p_enseignement and e.professeur_id = auth.uid()));
end $$;
create or replace function public.peut_bilan(p_eleve uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.est_admin()
      or (public.a_un_role(array['professeur_principal']::public.role_app[])
          and exists (select 1 from public.eleves e join public.classes c on c.id = e.classe_id
                      where e.id = p_eleve and c.prof_principal_id = auth.uid()));
end $$;
revoke execute on function
  public.peut_noter(uuid), public.peut_noter_eval(uuid), public.peut_bilan(uuid), public.periode_est_verrouillee(uuid),
  public.voit_toute_la_classe(uuid), public.voit_notes_ens(uuid), public.voit_notes_eval(uuid), public.voit_bilan_eleve(uuid),
  public.saisir_notes(uuid, jsonb), public.saisir_acquisitions(uuid, jsonb),
  public.moyennes_matieres(uuid, uuid), public.moyennes_generales(uuid, uuid), public.bilan_competences(uuid, uuid) from anon;
revoke all on public.competences, public.evaluations, public.evaluation_competences,
  public.notes, public.acquisitions, public.bilans_competences from anon;
