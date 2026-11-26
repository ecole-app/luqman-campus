# Journal de travail

## 2026-11-26 — étape 0a (fondations)
- Migration `0001_fondations.sql` : rôles, droits (RLS), horodatage serveur, journal d'audit immuable, réglages par défaut.
- 19 tests de droits (`npm run test:db`), lancés aussi par GitHub Actions.
- À faire par Ahmed : créer le projet Supabase gratuit (région UE), appliquer la migration, créer 3 comptes de test (voir `docs/ETAPE-0A.md`).
- Décision : hébergement gratuit pendant toute la construction, passage payant seulement au déploiement (étape 0b).

## 2026-11-26 — Étape 0a installée sur Supabase
- Projet Supabase `luqman-campus-dev` (Central EU / Francfort, offre gratuite), organisation « Luqmân Campus ».
- Migration `0001_fondations.sql` appliquée : 4 tables (profils, user_roles, parametres, journal_audit), RLS active, 17 réglages par défaut.
- 3 comptes de test fictifs créés (gestionnaire@, direction@, prof@exemple.test), sans mot de passe.
- Journal d'audit vérifié : 24 lignes après installation.
- Reste : étape 1 (données de l'établissement). Aucune vraie donnée avant l'étape 0b.

## 2026-11-26 — Étape 1 (données de l'établissement) installée
- Migration `0002_donnees_etablissement.sql` : années scolaires (une seule active), trimestres, classes, élèves (INE unique, suppression logique), matières, enseignements (coefficient > 0). Horodatage serveur, journal d'audit et droits par ligne sur chaque table.
- Droits : le personnel lit tout, la direction et l'administration écrivent, un élève ne voit que sa propre fiche.
- Import CSV : `controler_import_eleves` (ne modifie rien, signale toutes les erreurs ligne par ligne) puis `importer_eleves` (refuse tout s'il reste une erreur). Contrôles : champs manquants, date, INE, classe inconnue, doublons dans le fichier et dans la base.
- Données fictives (`supabase/seed_etape1.sql`) : année 2026-2027, 4 classes (6e A à 3e A), 10 matières, 48 élèves.
- 37 tests (`npm run test:db`), tous verts. Installé sur `luqman-campus-dev` : 10 tables protégées.
- Reste de l'étape 1 : écran d'administration (liste, import CSV avec aperçu, export), invitations par email. Reporté à l'écran PWA, pas encore commencé.
- Prochaine étape : étape 2 (vie scolaire du quotidien).
