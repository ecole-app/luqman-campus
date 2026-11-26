-- Comptes de TEST (fictifs). À lancer dans Supabase > SQL Editor APRÈS avoir créé
-- 3 utilisateurs dans Authentication > Users avec ces adresses :
--   gestionnaire@exemple.test, direction@exemple.test, prof@exemple.test
insert into public.profils(id, nom, prenom)
  select id, 'Gestionnaire', 'Appli' from auth.users where email = 'gestionnaire@exemple.test';
insert into public.profils(id, nom, prenom)
  select id, 'Directeur', 'Test' from auth.users where email = 'direction@exemple.test';
insert into public.profils(id, nom, prenom)
  select id, 'Benali', 'Test' from auth.users where email = 'prof@exemple.test';

insert into public.user_roles(user_id, role)
  select id, 'gestionnaire' from auth.users where email = 'gestionnaire@exemple.test';
insert into public.user_roles(user_id, role)
  select id, 'direction' from auth.users where email = 'direction@exemple.test'
  union all
  select id, 'administrateur' from auth.users where email = 'direction@exemple.test';
insert into public.user_roles(user_id, role)
  select id, 'professeur' from auth.users where email = 'prof@exemple.test';
