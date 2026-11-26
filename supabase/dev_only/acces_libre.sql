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

-- ---- Étape 2 : vie scolaire ----
create or replace function public.est_vie_scolaire() returns boolean
language sql stable security definer set search_path = public as $$ select true $$;
create or replace function public.peut_appeler(p_cours uuid) returns boolean
language sql stable security definer set search_path = public as $$ select true $$;

grant select, insert, update, delete on public.cours, public.presences, public.observations, public.punitions to anon;
grant select on public.appels, public.coffre_telephone to anon;
grant execute on function
  public.ouvrir_appel(uuid), public.valider_appel(uuid), public.appels_manquants(),
  public.deposer_telephone(uuid, text), public.restituer_telephone(uuid), public.signaler_non_depot(uuid) to anon;

-- Crée des cours fictifs pour AUJOURD'HUI (heure de Paris) : 6 cours par classe, de 8h à 15h25.
-- Efface d'abord les cours du jour (et leurs présences). Bouton « cours fictifs » de l'appli en mode test.
create or replace function public.dev_creer_cours_du_jour() returns integer
language plpgsql security definer set search_path = public as $$
declare nb int; jour0 timestamp := date_trunc('day', now() at time zone 'Europe/Paris');
begin
  delete from public.cours
   where debut >= (jour0 at time zone 'Europe/Paris') and debut < ((jour0 + interval '1 day') at time zone 'Europe/Paris');
  insert into public.cours (enseignement_id, debut, fin, salle)
  select x.id,
         ((jour0 + h.debut) at time zone 'Europe/Paris'),
         ((jour0 + h.debut + interval '55 minutes') at time zone 'Europe/Paris'),
         'Salle ' || x.rang
  from (select en.id, en.classe_id, row_number() over (partition by en.classe_id order by m.code) as rang
        from public.enseignements en join public.matieres m on m.id = en.matiere_id) x
  join (values (1, interval '8 hours'), (2, interval '9 hours'), (3, interval '10 hours 15 minutes'),
               (4, interval '11 hours 15 minutes'), (5, interval '13 hours 30 minutes'), (6, interval '14 hours 30 minutes'))
       as h(rang, debut) on h.rang = x.rang;
  get diagnostics nb = row_count;
  return nb;
end $$;
grant execute on function public.dev_creer_cours_du_jour() to anon;

