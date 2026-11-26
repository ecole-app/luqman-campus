-- Données FICTIVES de l'étape 1 (aucun vrai élève). À lancer après 0002_donnees_etablissement.sql.
insert into public.annees_scolaires(libelle, debut, fin, active) values ('2026-2027', '2026-09-01', '2027-07-04', true);

insert into public.periodes(annee_id, numero, libelle, debut, fin)
select id, n, 'Trimestre ' || n, d, f from public.annees_scolaires,
  (values (1, date '2026-09-01', date '2026-11-30'), (2, date '2026-12-01', date '2027-03-05'), (3, date '2027-03-06', date '2027-07-04')) as t(n, d, f);

insert into public.classes(annee_id, niveau, nom)
select id, n, n || ' A' from public.annees_scolaires, (values ('6e'), ('5e'), ('4e'), ('3e')) as t(n);

insert into public.matieres(code, nom) values
  ('FR', 'Français'), ('MATH', 'Mathématiques'), ('HG', 'Histoire-Géographie'), ('ANG', 'Anglais'),
  ('PC', 'Physique-Chimie'), ('SVT', 'Sciences de la vie et de la Terre'), ('EPS', 'Éducation physique et sportive'),
  ('ARAB', 'Arabe'), ('EDM', 'Éducation musicale'), ('ARTS', 'Arts plastiques');

-- Chaque classe suit toutes les matières, coefficient 1 (à régler ensuite), sans professeur affecté
insert into public.enseignements(classe_id, matiere_id, coefficient)
select c.id, m.id, 1 from public.classes c cross join public.matieres m;

-- 12 élèves fictifs par classe
insert into public.eleves(nom, prenom, date_naissance, classe_id)
select (array['Benali','Amrani','Ferhat','Kaci','Haddad','Mansouri','Slimani','Bouzid','Cherif','Rahmani','Salhi','Taleb'])[g],
       (array['Adam','Sarah','Yanis','Lina','Ilyes','Maya','Nael','Inès','Rayan','Nour','Amir','Sofia'])[((g + k) % 12) + 1],
       date '2014-01-15' + ((g * 23 + k * 5) % 300) - (k * 365),
       c.id
from (select id, (row_number() over (order by nom desc) - 1)::int as k from public.classes) c
cross join generate_series(1, 12) g;
