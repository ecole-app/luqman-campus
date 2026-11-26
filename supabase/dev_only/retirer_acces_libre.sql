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
language sql stable security definer set search_path = public as $$
  select public.est_vie_scolaire()
      or (public.a_un_role(array['professeur','professeur_principal']::public.role_app[])
          and exists (select 1 from public.cours c join public.enseignements e on e.id = c.enseignement_id
                      where c.id = p_cours and e.professeur_id = auth.uid()))
$$;

drop function if exists public.dev_creer_cours_du_jour();
revoke execute on function
  public.ouvrir_appel(uuid), public.valider_appel(uuid), public.appels_manquants(),
  public.deposer_telephone(uuid, text), public.restituer_telephone(uuid), public.signaler_non_depot(uuid) from anon;
revoke all on public.cours, public.presences, public.observations, public.punitions, public.appels, public.coffre_telephone from anon;

