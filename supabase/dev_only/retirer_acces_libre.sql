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
