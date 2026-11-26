-- Luqmân Campus — étape 0a : fondations
-- Rôles, droits (RLS), horodatage serveur, journal d'audit, paramètres.
-- Données fictives uniquement tant que l'étape 0b (déploiement) n'est pas faite.

create type public.role_app as enum (
  'gestionnaire','administrateur','direction','vie_scolaire',
  'professeur','professeur_principal','eleve','parent'
);

-- Profils : un par compte de connexion (auth.users de Supabase)
create table public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  prenom text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un utilisateur peut avoir plusieurs rôles (ex. direction + administrateur)
create table public.user_roles (
  user_id uuid not null references public.profils(id) on delete cascade,
  role public.role_app not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, role)
);

-- Réglages de l'établissement (seuils des avis, délais, règle de cycle...)
create table public.parametres (
  cle text primary key,
  valeur jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Journal d'audit : qui a fait quoi, quand (heure serveur). Jamais modifiable.
create table public.journal_audit (
  id bigint generated always as identity primary key,
  horodatage timestamptz not null default now(),
  auteur uuid,
  table_nom text not null,
  operation text not null,
  ligne_id text,
  avant jsonb,
  apres jsonb
);

-- ---------- Fonctions de droits ----------
-- Le gestionnaire est au-dessus de tous les rôles. Un compte désactivé n'a plus aucun droit.
create function public.a_un_role(rs public.role_app[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profils p on p.id = ur.user_id
    where ur.user_id = auth.uid() and p.actif
      and (ur.role = any(rs) or ur.role = 'gestionnaire')
  )
$$;

create function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_un_role(array['administrateur','direction']::public.role_app[])
$$;

create function public.est_personnel() returns boolean
language sql stable security definer set search_path = public as $$
  select public.a_un_role(array['administrateur','direction','vie_scolaire','professeur','professeur_principal']::public.role_app[])
$$;

-- ---------- Horodatage serveur : l'heure envoyée par le client est ignorée ----------
create function public.horodater() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger horodater_profils before insert or update on public.profils
  for each row execute function public.horodater();
create function public.horodater_parametres() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger horodater_parametres before insert or update on public.parametres
  for each row execute function public.horodater_parametres();

-- ---------- Journal d'audit ----------
create function public.auditer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.journal_audit(auteur, table_nom, operation, ligne_id, avant, apres)
  values (auth.uid(), tg_table_name, tg_op,
          coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
                   (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'cle',
                   (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'user_id'),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

create trigger auditer_profils after insert or update or delete on public.profils
  for each row execute function public.auditer();
create trigger auditer_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.auditer();
create trigger auditer_parametres after insert or update or delete on public.parametres
  for each row execute function public.auditer();

create function public.journal_immuable() returns trigger language plpgsql as $$
begin raise exception 'Le journal d''audit ne peut être ni modifié ni supprimé'; end $$;
create trigger journal_immuable before update or delete on public.journal_audit
  for each row execute function public.journal_immuable();

-- ---------- Droits d'accès (RLS) ----------
alter table public.profils enable row level security;
alter table public.user_roles enable row level security;
alter table public.parametres enable row level security;
alter table public.journal_audit enable row level security;

-- profils : chacun voit le sien, le personnel voit tout le monde, l'administration gère
create policy profils_lecture on public.profils for select
  using (id = auth.uid() or public.est_personnel());
create policy profils_ecriture on public.profils for all
  using (public.est_admin()) with check (public.est_admin());

-- user_roles : seul le gestionnaire peut donner, modifier ou retirer le rôle gestionnaire
create policy roles_lecture on public.user_roles for select
  using (user_id = auth.uid() or public.est_admin());
create policy roles_ecriture on public.user_roles for all
  using (public.est_admin() and (role <> 'gestionnaire' or public.a_un_role(array['gestionnaire']::public.role_app[])))
  with check (public.est_admin() and (role <> 'gestionnaire' or public.a_un_role(array['gestionnaire']::public.role_app[])));

-- parametres : le personnel lit, l'administration modifie
create policy parametres_lecture on public.parametres for select using (public.est_personnel());
create policy parametres_ecriture on public.parametres for all
  using (public.est_admin()) with check (public.est_admin());

-- journal : lecture réservée à l'administration, jamais d'écriture directe
create policy journal_lecture on public.journal_audit for select using (public.est_admin());

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profils, public.user_roles, public.parametres to authenticated;
grant select on public.journal_audit to authenticated;

-- ---------- Réglages par défaut (identiques à la démo) ----------
insert into public.parametres(cle, valeur, description) values
 ('appel_delai_min','30','Notification au professeur si l''appel n''est pas validé après (minutes)'),
 ('appel_alerte_vs_min','15','Puis alerte à la vie scolaire après (minutes)'),
 ('retard_palier_min','5','Palier de retard (minutes)'),
 ('avis_seuil_avertissement','10','Sous cette moyenne : avertissement possible'),
 ('avis_zone_proche','0.5','Zone « proche du seuil » (points)'),
 ('avis_compliments','14','Compliments à partir de'),
 ('avis_felicitations','16','Félicitations au-dessus de'),
 ('avis_felicitations_min_matiere','10','… et toutes les matières au-dessus de'),
 ('avis_eloges','18','Éloges au-dessus de'),
 ('avis_eloges_min_matiere','16','… et toutes les matières au-dessus de'),
 ('cycle_composantes_requises','6','Composantes à valider (sur 8)'),
 ('cycle_niveau_minimum','3','Niveau minimum (1 à 4)'),
 ('telephone_non_depots_avant_sanction','3','Non-dépôts avant sanction'),
 ('telephone_heure_controle','"16:30"','Heure du contrôle de fin de journée'),
 ('edt_heures_max_jour','6','Heures maximum par jour et par professeur'),
 ('bulletin_afficher_rang','true','Afficher le rang sur le bulletin'),
 ('bulletin_publie_familles','false','Bulletins visibles par les familles');
