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

## 2026-11-27 — Étape 3 : socle commun aux libellés officiels
- Constat : mes libellés de D2 à D5 étaient des paraphrases et D1.2 omettait les langues régionales. Migration `0006` : textes exacts du décret n° 2015-372 du 31-3-2015 (BO n° 17 du 23-4-2015), colonnes `officiel`, `source_ref`, `source_url`. Un texte officiel ne se modifie ni ne se supprime (on peut le désactiver) ; une compétence ajoutée par le collège est toujours marquée « non officielle ».
- Programmes (pour l'étape 7) : ils changent par niveau et par année — français/maths/langues cycle 4 : BO n° 10 du 5-3-2026 (5e en 2026, 4e en 2027, 3e en 2028) ; EPS et histoire-géo cycles 2-3 : BO n° 22 du 28-5-2026 (EPS 6e : rentrée 2027, ancien programme valable en 2026-27) ; autres matières cycle 4 : BO du 30-7-2020. Principe : table des programmes officiels versionnée (BO, NOR, date, lien), fiches rattachées à un élément officiel, alerte quand un programme est remplacé, validation par la direction.
- Tests : `test:db` 133/133, `test:ecrans` 65/65. Cache `lc-app-v6`.
- **Pour installer** : appliquer `0006` dans l'éditeur SQL (pas besoin de relancer `acces_libre.sql`).

## 2026-11-27 — Étape 3 : compléments (rôles, réglages, hors ligne, graphiques)
- Migration `0007` : `mes_droits_notes()` (admin, classes dont on est prof principal, matières enseignées). L'appli cache les boutons non autorisés (réglages, verrouillage de période, correction du bilan, catalogue, création d'évaluation sur la matière d'un collègue → lecture seule). Les vrais droits restent appliqués par la base.
- Onglet Notes › **Réglages** (direction) : visibilité des notes (tout le personnel ou non), seuils jaune/rouge, « non rendu compte 0 », noms des 4 niveaux.
- **Notes hors ligne** : si le réseau coupe pendant la saisie, la note est gardée sur l'appareil (⏳) et part toute seule au retour du réseau (événement `online`, toutes les 20 s, et à l'ouverture de l'onglet). Limite : l'onglet doit avoir été ouvert avec du réseau avant la coupure.
- **Fiche élève** : courbe d'évolution des notes (/20, moyenne de classe en pointillés, points jaunes/rouges, filtre par matière) et camembert de la répartition des niveaux de compétence (réservé prof principal / direction).
- Tests : `test:db` 135/135, `test:ecrans` 77/77. Cache `lc-app-v7`, `notes.js?v=3`.
- Restes étape 3 : historique des notes modifiées (écran sur le journal d'audit), import CSV de notes, copie d'une évaluation vers une autre classe, bibliothèque d'évaluations entre professeurs (étape 7), notes visibles aux familles (phase 2), ouverture à froid de l'onglet Notes sans réseau.

## 2026-11-27 — Étape 3 : toutes les améliorations restantes
- Migration `0008` : `historique_notes` (qui a saisi / modifié / effacé quelle note, quand — lu dans le journal d'audit, visible de ceux qui voient les notes), `copier_evaluation` (même évaluation sans les notes, autre classe/matière que le professeur enseigne), bibliothèque `modeles_evaluation` + `publier_modele` / `utiliser_modele` (compétences re-liées par code selon le cycle de la classe cible).
- Écrans (Notes › évaluation) : 🕘 Historique, ⬆ Import CSV (Nom ; Prénom ; Note — reconnaissance sans accents ni majuscules, aperçu, lignes refusées expliquées), ⧉ Copier vers une autre classe, 📚 Publier dans la bibliothèque, case « Publiée aux familles » (préparée : l'espace familles est en phase 2). Nouvel onglet Notes › **Bibliothèque** avec avertissement « contenus de professeurs, pas des textes officiels ».
- **Ouverture à froid hors ligne** : l'onglet Notes garde une copie locale (réglages, périodes, compétences, droits, évaluations et notes vues) ; sans réseau il s'ouvre sur cette copie avec un bandeau, et les notes saisies partent au retour du réseau.
- Tests : `test:db` 140/140, `test:ecrans` 87/87. Cache `lc-app-v8`, `notes.js?v=4`.
- **Pour installer** : appliquer `0008` dans l'éditeur SQL, puis relancer `acces_libre.sql` en entier.
- À valider avec le directeur : qui peut retirer un modèle de la bibliothèque (aujourd'hui son auteur et l'administration) ; durée de conservation de l'historique (étape 0b).

## 2026-11-27 — Correctif : publication d'un modèle sans connexion
- Trouvé au test réel : en mode test (sans connexion) la publication dans la bibliothèque échouait (`created_by` obligatoire). Migration `0009` : auteur facultatif (rempli automatiquement dès qu'on est connecté). Test ajouté (141/141). Leçon : les tests de base simulent un utilisateur connecté, le mode test sans connexion doit avoir ses propres tests pour chaque nouvelle fonction.
- **Pour installer** : appliquer `0009` dans l'éditeur SQL.

## 2026-11-27 — Points à valider avec le directeur regroupés
- Décision d'Ahmed : tout ce qui demande l'avis du directeur est gardé pour la fin. Liste dans `docs/A-VALIDER-AVEC-LE-DIRECTEUR.md` (9 points à ce jour), à compléter à chaque étape.

## 2026-11-27 — Étape 4 : appréciations et bulletins
- Migration `0010` : `appreciations` (élève × matière × période), `elements_programme` (matière × période), `appreciations_generales` (+ mention), `bulletins_periode` (ouvert → validé → publié), `banque_phrases` (24 phrases de départ). Règles serveur : bulletin validé ou période verrouillée = seule la direction modifie ; longueur maximale ; élève de la classe ; mention dans la liste réglée. Droits : appréciation lue par qui voit les notes de la matière, écrite par son professeur ; générale et mention par le professeur principal ou la direction. Fonctions `saisir_appreciations`, `saisir_elements_programme`, `saisir_appreciation_generale`, `changer_statut_bulletin`, `suivi_appreciations`, `donnees_bulletins` (tout le bulletin d'une classe en un appel : moyennes, rang si réglé, appréciations, demi-journées d'absence et retards de la période, bilan des compétences).
- Écrans (`app/bulletins.js`) : onglet **Appréciations** (par matière avec moyenne et évolution, enregistrement automatique, compteur, 💡 proposition par règles fixes, 📋 phrases, éléments du programme ; appréciation générale + mention proposée selon les seuils ; banque de phrases) et onglet **Bulletins** (suivi du remplissage, validation/publication, aperçu, impression d'un élève ou de toute la classe — une page A4 par élève, PDF via « Enregistrer au format PDF », réglages : en-tête, longueurs, rang, mentions, seuils). Appréciations gardées sur l'appareil si le réseau coupe.
- Format calqué sur le bilan périodique du livret scolaire (arrêté du 31-12-2015). Le réglage `bulletin_afficher_rang` existait depuis l'étape 1 (vrai).
- Tests : `test:db` 154/154, `test:ecrans` 107/107. Cache `lc-app-v9`, `bulletins.js?v=1`, `notes.js?v=5`.
- **Pour installer** : appliquer `0010` dans l'éditeur SQL, puis relancer `acces_libre.sql` en entier.
- Points pour le directeur ajoutés (10 à 16) dans `docs/A-VALIDER-AVEC-LE-DIRECTEUR.md`.

## 2026-11-27 — Correctif : réglages illisibles en mode test
- Trouvé au test réel de l'étape 4 : en mode test sans connexion, la table `parametres` n'était pas ouverte ; l'appli retombait sur ses valeurs par défaut (seuils des notes, mentions vides → mention impossible à choisir). `acces_libre.sql` ouvre maintenant `parametres` en lecture/écriture (retiré par `retirer_acces_libre.sql`). Liste de mentions de secours dans l'appli. Tests 156/156, écrans 107/107. Cache `lc-app-v10`, `bulletins.js?v=2`.
- **Pour installer** : relancer `acces_libre.sql` en entier.

## 2026-11-27 — Banque de phrases : correction par les professeurs
- Chaque professeur peut maintenant **corriger** (✏️) ses phrases et les phrases de départ, plus seulement la direction. « Retirer » reste limité à ses propres phrases (direction : toutes). Migration `0011_phrases_correction_profs.sql` (politiques insert/update/delete séparées, réservées au personnel).
- Tests : `test:db` 157/157, `test:ecrans` 108/108. Cache `lc-app-v11`, `bulletins.js?v=3`.
- **Pour installer** : appliquer `0011` dans l'éditeur SQL, puis relancer `acces_libre.sql` en entier (inchangé, mais règle habituelle).

## 2026-11-27 — Étape 4, améliorations (lot 1)
- **Mise en page du bulletin réglable par la direction** (Bulletins › Aperçu › 🎛 Mettre en page) : ordre et visibilité des 8 blocs, ordre et visibilité des 4 colonnes du tableau, taille compacte, retouche libre du texte sur l'aperçu (par élève, non enregistrée, valable pour l'impression), enregistrement comme mise en page par défaut (paramètre `bulletin_mise_en_page`), retour à la mise en page standard.
- **Tableau de remplissage de toutes les classes** (direction, Bulletins › Toutes les classes) : progression par classe, reste à faire par matière et professeur, filtre « incomplètes », lien vers le suivi de la classe. RPC `suivi_toutes_classes`.
- **Historique des appréciations** (bouton 🕘 sous chaque appréciation) : RPC `historique_appreciations` lue dans le journal d'audit.
- Migration `0012_bulletins_mise_en_page_suivi_historique.sql`. Tests : `test:db` 159/159, `test:ecrans` 120/120. Cache `lc-app-v12`, `bulletins.js?v=4`.
- **Pour installer** : appliquer `0011` puis `0012` dans l'éditeur SQL, relancer `acces_libre.sql` en entier.
- **Reste du lot** (décidé avec Ahmed) : bilan de fin de cycle (6e/3e), export PDF en un seul fichier, maquette de l'IA (non branchée, décision RGPD du directeur).

## 2026-11-28 — Étape 4, améliorations (lot 2)
- **Bilan de fin de cycle** (Bulletins › Bilan de fin de cycle, 6e = fin du cycle 3, 3e = fin du cycle 4) : 8 composantes du socle × 4 niveaux, niveau proposé d'après les compétences évaluées pendant l'année (●), corrigeable (↺ pour revenir au proposé), total de points (10/25/40/50, sur 400, réglage `bilan_cycle_afficher_points`), synthèse des acquis avec 💡 Proposer, impression d'un bilan ou de la classe. Migration `0013_bilan_fin_de_cycle.sql` (tables `bilans_cycle`, `syntheses_cycle`, RPC `donnees_bilan_cycle`, `saisir_bilan_cycle`). Réservé au professeur principal et à la direction.
- **PDF unique** : boutons ⬇ « PDF de ce bulletin / de la classe » (bulletins et bilans de fin de cycle), généré dans le navigateur (html2pdf 0.10.3, MIT, vendu dans `app/vendor/`, chargé seulement au premier clic). Une page A4 par élève, mise en page du directeur respectée. Limite : le texte est une image dans le PDF (pas sélectionnable).
- **IA** : décision d'Ahmed, on ne branche pas d'IA externe (les propositions par règles suffisent). Voir point 15 de la liste du directeur.
- Tests : `test:db` 166/166, `test:ecrans` 130/130. Cache `lc-app-v13`, `bulletins.js?v=6`.
- **Pour installer** : appliquer `0013` dans l'éditeur SQL, relancer `acces_libre.sql` en entier.

## 2026-11-28 — Étape 5 : conseil de classe (mode deux écrans)
- Migration `0014_conseil_de_classe.sql` : tables `conseils` (classe × période : statut, vue projetée, élève projeté, options, révision, début/fin) et `conseil_eleves` (vu, à revoir, remarque interne), fonctions `ouvrir_conseil`, `piloter_conseil`, `noter_conseil_eleve`, `peut_animer_conseil` (direction ou professeur principal), lecture par qui voit toute la classe, journal d'audit, tables ajoutées à la publication `supabase_realtime`.
- Écran **Conseil de classe** (`app/conseil.js`) : ouverture du conseil, vues projetées Accueil / Vue de la classe (moyennes par matière avec plage min–max, répartition des moyennes, absences, aucun nom) / Élève (moyenne, évolution, rang en option, absences, mention, résultats par matière avec moyenne de la classe, appréciations, appréciation générale) / Synthèse (mentions avec noms) ; aperçu en direct de l'écran projeté ; mention et appréciation générale saisies pendant le conseil (💡 Proposer) ; remarque interne et ⚑ à revoir (jamais projetées) ; « ✓ Vu · élève suivant », flèches ← → ; chrono et compteur d'élèves vus ; terminer / rouvrir ; compte rendu interne imprimable et en PDF.
- **Écran projeté** : lien `app/?projection=<id>` sur un autre appareil (ou bouton 📺), plein écran, scène 16/9 mise à l'échelle. Suit le pilotage par Supabase Realtime, sinon relecture toutes les 4 s ; dans le même navigateur, BroadcastChannel (instantané).
- Tests : `test:db` 177/177, `test:ecrans` 150/150. Cache `lc-app-v14`, `bulletins.js?v=7`, `conseil.js?v=1`.
- **Pour installer** : appliquer `0014` dans l'éditeur SQL, relancer `acces_libre.sql` en entier.
- Points pour le directeur : 21 à 23.

## 2026-11-28 — Étape 5 : photo de l'élève au conseil de classe
- Demande d'Ahmed. Migration `0015_photos_eleves.sql` : table `photos_eleves` (image réduite dans l'appli, 300 × 375 px JPEG, 200 Ko au plus, en texte), lue par le personnel, ajoutée / changée / retirée par la direction ; pas de copie dans le journal d'audit (trop lourd).
- Conseil de classe : photo (ou initiales) à côté du nom sur l'écran projeté et au pilotage ; 📷 Ajouter / Changer / Retirer la photo ; 📷 Importer les photos de la classe en lot (fichiers reconnus par leur nom « NOM_Prénom », sans accents ni majuscules ; fichiers non reconnus signalés). L'écran projeté recharge les photos dès qu'elles changent.
- Tests : `test:db` 181/181, `test:ecrans` 154/154. Cache `lc-app-v15`, `conseil.js?v=2`.
- **Pour installer** : appliquer `0015` dans l'éditeur SQL, relancer `acces_libre.sql` en entier. Point 24 pour le directeur (droit à l'image).

## 2026-11-28 — Étape 6 : emploi du temps
- Migration `0016_emploi_du_temps.sql` : `creneaux` (grille de départ : 7 créneaux L-M-J-V, mercredi matin), `salles`, `edt_regles` (indisponibilités d'un professeur, d'une classe, d'une salle ou d'une matière ; obligatoires ou préférences pondérées 1 à 5), `edt_versions` (brouillon / publiée), `edt_seances` (créneau de départ, durée, salle, verrouillage) ; enseignements : `bloc` (durée d'une séance), `groupe_id`, `salle_id` ; réglage `edt_max_matiere_jour` (2). Fonctions `edt_donnees`, `edt_occupation`, `controler_edt` (classe/groupe, professeur, salle, indisponibilités obligatoires, séance coupée par une pause, maximum par jour), `enregistrer_edt` et `modifier_seance` (refusés en cas de conflit), `publier_edt` (crée les cours de la période hors fermetures, remplace les cours à venir d'une publication précédente sauf ceux dont l'appel est ouvert ; pas de copie de chaque cours dans le journal). Lecture par le personnel, écriture par la direction.
- Générateur `app/edt-solveur.js` (Web Worker, testable en Node) : construction par séances les plus contraintes d'abord + recuit simulé ; contraintes obligatoires jamais violées ; préférences : trous des classes (poids 10), trous des professeurs (3), même matière deux fois le même jour (4), préférences (5 × poids), journées trop chargées. Diagnostic avant génération (surcharge d'un professeur ou d'une classe, séances sans place possible, heures non indiquées, sans professeur). Séances verrouillées gardées.
- Écran **Emploi du temps** (`app/edt.js`) : Grille (par classe / professeur / salle, clic sur une séance puis sur une case verte pour la déplacer, verrouiller, changer de salle, conflits affichés, impression), Générer, Contraintes (heures et durée des séances, salle imposée, groupe ; indisponibilités et préférences ; salles ; grille horaire ; maximum par jour), Publier (avec confirmation).
- Tests : `test:db` 197/197, `test:edt` 13/13 (collège fictif de 4 classes, 109 h, gymnase le mercredi), `test:ecrans` 172/172. Cache `lc-app-v16`, `edt.js?v=1`, `edt-solveur.js?v=1`.
- **Pour installer** : appliquer `0016` dans l'éditeur SQL, relancer `acces_libre.sql` en entier. Points 25 à 27 pour le directeur.
