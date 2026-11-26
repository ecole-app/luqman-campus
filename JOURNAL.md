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
(La page à deux versions — bouton « Démo / Appli réelle » dans l'en-tête de la démo — est **temporaire** : un seul bouton à retirer quand Ahmed le décide.)

## 2026-11-26 — Étape 2 : vie scolaire du quotidien
- Migration `0003_vie_scolaire.sql` : cours, appels, présences (présent / absent / retard / sortie / dispensé), observations, punitions, coffre à téléphones. Heures toujours celles du serveur, auteur des observations/punitions non falsifiable, retard arrondi au palier réglé (`retard_palier_min`), appels non validés remontés après `appel_delai_min` puis `appel_alerte_vs_min`. Un professeur ne fait l'appel que de ses cours ; la vie scolaire de tous.
- Retenue : le nombre d'heures est obligatoire (colonne `duree_heures`, demande d'Ahmed).
- Tests : `npm run test:db` = 69 tests, tous verts (dont droits prof/élève/vie scolaire, arrondi du retard, sortie, coffre, journal d'audit).
- Test réel dans le navigateur : 2 défauts trouvés et corrigés (droits en accès libre sur les présences ; « appels non faits » vide faute de lecture des réglages).
- Installé sur Supabase (migration + extension de l'accès libre). `dev_creer_cours_du_jour()` crée 24 cours fictifs pour aujourd'hui (bouton en mode test).
- Écrans dans `app/vie-scolaire.js` : Appel, Suivi du jour, Téléphones, Punitions. Pensé pour téléphone (gros boutons).
- **À retirer avant 0b** : `retirer_acces_libre.sql` couvre aussi l'étape 2 (testé) et supprime `dev_creer_cours_du_jour`.
- Pas encore fait : notifications push réelles (appel manquant), mode hors ligne.

## 2026-11-26 — Étape 2 approfondie (branche `etape-2-complements`, en attente d'installation)
Demande d'Ahmed : aller au bout de l'étape 2 pour ne pas y revenir. Tout fait sauf les notifications push (rien de mis en place côté envoi ; à reprendre plus tard).
- Migration `0004_vie_scolaire_complements.sql` :
  - **hors ligne** : `synchroniser_presences` accepte l'heure du téléphone, bornée (pas dans le futur, pas avant le cours, au plus `hors_ligne_tolerance_min` = 240 min en arrière), saisie marquée ;
  - **appel validé verrouillé** : seule la vie scolaire corrige (`corriger_presence`, motif obligatoire, heure réelle possible, table `corrections_presence`) ;
  - **justification** des absences et retards (vie scolaire seulement : qui, quand, justificatif reçu) ;
  - **absences prévues** (rendez-vous, sortie pédagogique…) : pré-remplies « absent justifié » dans l'appel, même s'il est déjà ouvert ;
  - **cours annulés / remplaçant** (le remplaçant fait l'appel et c'est lui qu'on relance), **groupes** (l'appel ne liste que le groupe), **jours sans cours** (`fermetures`, exclus des appels manquants) ;
  - **retenues complètes** : demande du professeur → la vie scolaire la place sur une séance → pointage présent / absent ; **sanctions** réservées à la direction (échelle réglable `sanctions_echelle`) ; **rapports d'incident** avec élèves impliqués (auteur, victime, témoin) ;
  - **infirmerie** (heures serveur, registre visible vie scolaire / direction seulement ; « récupéré par la famille » = sortie dans le cours en cours, tracée) ;
  - **observations confidentielles** (auteur + vie scolaire) ; **élèves à surveiller** (seuils réglables : retards de la période, demi-journées non justifiées du mois, téléphones) ; **statistiques d'absentéisme** par classe.
- Écrans : `app/vie-scolaire.js` (réécrit : appel hors ligne avec file d'attente, correction, annulation / remplaçant / groupe, justification, retenues) et `app/vie-scolaire-2.js` (fiche élève, tableau de bord + export CSV, incidents, infirmerie, calendrier, groupes). Appel plus compact sur téléphone (5 boutons sur une ligne).
- PWA : `sw.js` (l'appli s'ouvre sans réseau), `manifest.webmanifest`, icônes (installable sur l'écran d'accueil). Librairie Supabase intégrée au dépôt (`app/vendor/`) au lieu du CDN, et sans nouvelles tentatives automatiques (elles bloquaient 8 s par requête hors ligne).
- Tests : `npm run test:db` = 97 tests verts ; nouveau `npm run test:ecrans` = 40 tests d'écran verts (Chrome format téléphone, faux Supabase, coupure réseau simulée). Les deux tournent sur GitHub.
- **Pour installer** (depuis un ordinateur) : appliquer `0004` sur Supabase, **puis relancer `supabase/dev_only/acces_libre.sql` en entier** (0004 remet la règle d'appel par rôle, l'accès libre doit être réappliqué), puis fusionner la PR. Ensuite test réel dans le navigateur.
- Restes : notifications push ; test chronométré d'un appel de 25 élèves sur un vrai téléphone ; points ajoutés à `docs/ETAPE-0B.md` (copie hors ligne, durées de conservation, boutons selon le rôle).


## 2026-11-26 — Étape 2 approfondie installée
- Migration `0004` appliquée sur Supabase, `acces_libre.sql` relancé en entier, PR #1 fusionnée, site redéployé.
- Test réel dans le navigateur (données fictives) : les 10 onglets de la vie scolaire s'ouvrent sans erreur ; un appel a été ouvert, un absent et un retard saisis (heure posée par le serveur), puis appel validé et verrouillé (« Corriger » avec motif).
- Décisions d'Ahmed pour l'étape 3 : note ≥ 18 en jaune pétillant, note < 8 en rouge écarlate (seuils réglables, pastille lisible).
- À faire : inviter le directeur (compte GitHub Luqman42, rôle Write) sur le dépôt ; intégrer son système « Présences Luqmân » (appel des profs) ; test chronométré de 25 élèves sur téléphone ; notifications push.

## 2026-11-26 — Étape 3 : notes et compétences (prête, pas encore installée)
- Migration `0005` : évaluations (barème, coefficient, période déduite de la date, verrouillage de période), notes (note / absent / dispensé / non rendu), compétences du socle par cycle (6e = cycle 3 ; 5e–3e = cycle 4, 4 niveaux), bilans proposés (moyenne arrondie des niveaux) corrigeables par le professeur principal / la direction. Fonctions `saisir_notes`, `saisir_acquisitions`, `moyennes_matieres`, `moyennes_generales` (rang, ex æquo), `bilan_competences`.
- Décisions : notes ramenées sur 20 puis pondérées par le coefficient de l'évaluation ; moyenne générale pondérée par le coefficient de la matière ; moyenne annuelle = toutes les notes de l'année ; « non rendu » compte 0 (réglable) ; ≥ 18 jaune pétillant (inclus), < 8 rouge écarlate, seuils réglables (`note_seuil_haut`, `note_seuil_bas`).
- Visibilité (décision d'Ahmed) : par défaut chaque professeur lit les notes de ses matières, le professeur principal celles de sa classe (moyenne générale et bilans compris), la direction tout ; la vie scolaire n'y a pas accès. Réglage `notes_visibles_tout_personnel` (faux par défaut) pour ouvrir à tout le personnel : `update parametres set valeur='true' where cle='notes_visibles_tout_personnel';`. Élèves / parents : aucun accès pour l'instant (colonne `visible_familles` réservée à la phase 2).
- Écrans : onglets « Notes » (saisie rapide au clavier, enregistrement automatique, relevé de classe, export CSV, verrouillage de période) et « Compétences » (saisie par niveau, bilan, catalogue). `app/notes.js` rafraîchit lui-même la liste des enseignements depuis le serveur.
- Tests : `test:db` 130/130, `test:ecrans` 64/64. Cache du service worker : `lc-app-v5`.
- **Pour installer** : appliquer `0005` sur Supabase (éditeur SQL, depuis un ordinateur), **puis relancer `acces_libre.sql` en entier**.
- Restes : cacher les boutons selon le rôle (ETAPE-0B), notes visibles aux familles (phase 2), appréciations et bulletins (étape 4).
