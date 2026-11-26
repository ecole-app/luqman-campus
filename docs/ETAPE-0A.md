# Étape 0a — Fondations (gratuit, données fictives)

## Ce qui est fait (dans ce dépôt)
- `supabase/migrations/0001_fondations.sql` : 8 rôles (gestionnaire au-dessus de tous, direction qui peut aussi être administrateur), droits par ligne (RLS), heure serveur, journal d'audit qui ne peut être ni modifié ni effacé, 17 réglages par défaut (mêmes valeurs que la démo).
- `supabase/tests/run.mjs` : 19 tests (visiteur, élève, prof, direction, gestionnaire, compte désactivé, journal). Lancement : `npm install` puis `npm run test:db`.
- `.github/workflows/tests.yml` : le robot de tests tourne à chaque envoi sur GitHub.
- `supabase/seed_dev.sql` : 3 comptes de test.

## À faire par Ahmed (15 min, tu es le seul à pouvoir créer ces comptes)
1. Va sur supabase.com, connecte-toi avec GitHub, « New project ».
2. Nom : `luqman-campus-dev` · Région : Europe (Paris ou Francfort) · Offre : Free.
3. Crée un mot de passe de base de données et range-le dans ton gestionnaire de mots de passe. Ne l'envoie à personne, pas même à Claude.
4. SQL Editor → colle tout le contenu de `supabase/migrations/0001_fondations.sql` → Run.
5. Authentication → Users → Add user (3 fois, mots de passe de test) : `gestionnaire@exemple.test`, `direction@exemple.test`, `prof@exemple.test`.
6. SQL Editor → colle `supabase/seed_dev.sql` → Run.
7. Dis-moi « 0a installé ».

## Règles à garder en tête
- Aucun vrai nom d'élève avant le déploiement (étape 0b : offre payante, sauvegardes, nom de domaine, contrôle RGPD).
- Le projet gratuit se met en pause après environ une semaine sans activité : on le relance en un clic.
- L'offre gratuite n'a pas de sauvegarde quotidienne : c'est acceptable seulement parce que tout est fictif.

## Étape suivante
Étape 1 : année scolaire, trimestres, classes, élèves, matières, coefficients, affectations des profs, import CSV SIECLE.
