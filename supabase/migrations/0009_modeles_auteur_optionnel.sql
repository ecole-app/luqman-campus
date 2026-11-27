-- Correctif : en mode test (accès libre, sans connexion) il n'y a pas d'utilisateur, donc pas d'auteur.
-- L'auteur reste renseigné automatiquement dès qu'une personne est connectée.
alter table public.modeles_evaluation alter column created_by drop not null;
