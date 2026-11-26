-- DEV UNIQUEMENT — ACCÈS LIBRE TEMPORAIRE (données fictives seulement).
-- Ouvre les tables de l'étape 1 aux visiteurs non connectés, pour tester les écrans sans connexion.
-- À RETIRER AVANT L'ÉTAPE 0B : lancer retirer_acces_libre.sql (voir docs/ETAPE-0B.md).
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$ select true $$;
create or replace function public.est_personnel() returns boolean
language sql stable security definer set search_path = public as $$ select true $$;

grant usage on schema public to anon;
grant select, insert, update, delete on
  public.annees_scolaires, public.periodes, public.classes,
  public.eleves, public.matieres, public.enseignements to anon;
grant execute on function public.controler_import_eleves(jsonb), public.importer_eleves(jsonb) to anon;
