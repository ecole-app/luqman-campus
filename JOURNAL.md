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
- Prochaine étape : étape 2 (vie scolaire du quotidien).

## 2026-11-26 — Étape 1 : écrans d'administration
- Appli en ligne : https://ecole-app.github.io/luqman-campus/app/ (fichiers `app/index.html` et `app/config.js`). Onglets : élèves (liste, recherche, ajout, retrait), classes, matières et coefficients (modifiables), import CSV (aperçu, erreurs ligne par ligne, import en une fois), export CSV.
- Testé en vrai dans le navigateur : fichier de 25 lignes avec 3 erreurs volontaires → lignes 23, 24, 25 signalées, rien écrit ; fichier corrigé → 22 élèves importés ; réimport → refusé (doublons) ; coefficient modifié puis remis. Élèves d'essai retirés (base revenue à 48 élèves).
- **Accès libre temporaire** sur le projet de test (décision d'Ahmed) : scripts dans `supabase/dev_only/` (`acces_libre.sql` appliqué, `retirer_acces_libre.sql` testé par `npm run test:db`, 41 tests verts). Les profils, rôles, réglages et le journal d'audit restent protégés. **À RETIRER AVANT L'ÉTAPE 0B** : voir `docs/ETAPE-0B.md`.
- Clé publique Supabase dans `app/config.js` (autorisé et précisé dans `CLAUDE.md`) ; la clé secrète n'est jamais dans le dépôt.
- Pas encore fait : invitations par email et export au format SIECLE BEE (dépendent de la connexion sécurisée, à reprendre avec elle).

## 2026-11-26 — Démo et appli réelle réunies
- La démo (https://ecole-app.github.io/luqman-campus/) a maintenant un bouton « Démo (maquettes) / Appli réelle » dans l'en-tête : « Appli réelle » affiche la vraie appli (`app/`, branchée sur Supabase) dans la même page. Lien direct : `?mode=reel`.
- À chaque nouvelle étape terminée, son écran s'ajoute dans `app/` et apparaît donc dans « Appli réelle ».
