# À valider avec le directeur

Liste tenue à jour au fil des étapes. Ahmed la passe avec le directeur **à la fin** (avant l'étape 0b / la mise en service).
Chaque point indique ce qui est fait aujourd'hui et ce qu'il faut décider.

## Notes et compétences (étape 3)
1. **Qui voit les notes.** Aujourd'hui : chaque professeur voit les notes de ses matières, le professeur principal celles de sa classe (moyenne générale et bilans compris), la direction tout, la vie scolaire rien. Un réglage « tout le personnel voit toutes les notes » existe (Notes › Réglages). *Décider : ce défaut convient-il ? La vie scolaire doit-elle voir les moyennes ?*
2. **Moyenne annuelle.** Aujourd'hui : toutes les notes de l'année sont mises ensemble (pondérées par les coefficients), et non la moyenne des moyennes de trimestre. *Décider : méthode du collège.*
3. **Couleurs des notes.** Jaune pétillant à partir de 18 (inclus), rouge écarlate sous 8. Seuils réglables. *Décider : les seuils.*
4. **Devoir « non rendu ».** Compte 0 dans la moyenne (réglable). *Décider : règle du collège.*
5. **Historique des notes.** Toutes les saisies, modifications et effacements sont conservés. *Décider : durée de conservation (à fixer avec l'étape 0b / RGPD).*
6. **Bibliothèque d'évaluations.** Un modèle peut être retiré par son auteur et par l'administration. *Décider : qui d'autre ?*
7. **Notes publiées aux familles.** La case existe mais ne fait rien tant que l'espace parents/élèves n'est pas ouvert (phase 2). *Décider : quand et qui publie (note par note, après le conseil de classe ?).*
8. **Conformité aux textes officiels.** Le socle est recopié du décret n° 2015-372 (BO n° 17 du 23-4-2015) avec la source affichée. Les programmes (étape 7) seront rattachés aux Bulletins officiels en vigueur par niveau et par année. *Décider : qui relit le catalogue avant un contrôle (direction, référent de l'académie) ?*

## Intégration
9. **« Présences Luqmân »** (appel des professeurs, système du directeur) : il doit la mettre sur GitHub (public ou accès donné) et donner le lien. Puis décider de l'intégration (absences de professeurs → cours annulés / remplaçants). *Vérifier aussi qu'il a bien le rôle Write sur le dépôt (il teste en créant une branche).*

## Appréciations et bulletins (étape 4)
10. **Format du bulletin.** Calqué sur le bilan périodique du livret scolaire (arrêté du 31-12-2015) : éléments du programme travaillés, moyenne, appréciation, vie scolaire, appréciation générale. L'application nationale LSU concerne le public et le privé sous contrat ; en hors contrat, le contrôle porte sur l'acquisition du socle. *Décider : garder ce format ? ajouter un bilan de fin de cycle (6e, 3e) ?*
11. **Mentions.** Liste actuelle : Éloges, Félicitations, Compliments, Encouragements, Avertissement travail / comportement / assiduité ; mention *proposée* selon les seuils (compliments ≥ 14, félicitations > 16 et toutes matières ≥ 10, éloges ≥ 18 et toutes matières ≥ 16, avertissement < 10). *Décider : liste et seuils du collège.*
12. **Rang sur le bulletin.** Affiché aujourd'hui (réglage existant depuis l'étape 1). *Décider : l'afficher ou non.*
13. **Validation.** La direction valide (les saisies des professeurs sont alors figées) puis publie. *Décider : qui valide, et à quel moment (avant ou après le conseil de classe) ?*
14. **Longueur des appréciations.** 400 caractères maximum (éléments du programme : 600). *Décider.*
15. **Propositions automatiques d'appréciations.** Aujourd'hui : règles fixes dans l'appli (moyenne, évolution, travaux non rendus, absences), sans IA externe, aucune donnée ne sort. Une vraie IA (ex. Gemini) enverrait des données d'élèves à un service tiers : *décider si on l'autorise (RGPD, information des familles) avant de la brancher.*
16. **En-tête et signatures.** Nom et adresse exacts du collège, logo, mentions légales ; cases de signature (professeur principal, direction, responsables légaux). *Fournir les informations.*
17. **Banque de phrases partagée.** Tout professeur peut corriger les phrases de départ (elles changent alors pour tout le monde) ; seule la direction peut les retirer. *Décider : laisser ainsi, ou réserver la correction des phrases de départ à la direction ?*
18. **Mise en page des bulletins.** La direction peut réordonner/masquer les blocs et les colonnes et retoucher le texte avant impression. *Décider : mise en page par défaut du collège ; qui a le droit de retoucher à la main un bulletin (aujourd'hui : direction uniquement) ; faut-il garder une trace des retouches ?*
19. **Bilan de fin de cycle.** Grille officielle (8 composantes, 4 niveaux, synthèse) pour les 6e et les 3e ; total de points sur 400 (barème du brevet, 10/25/40/50) affiché par défaut. *Décider : garder l'affichage du total de points (le collège est hors contrat, sans protocole de brevet) ? Qui signe (chef d'établissement, professeur principal) ? Quand le remplir (3e trimestre) ?*
20. **PDF des bulletins.** Généré dans l'appli : le texte y est une image (non sélectionnable, non recherchable). *Décider : suffisant, ou faut-il un PDF « texte » (génération côté serveur) pour l'archivage ?*
21. **Conseil de classe : qui anime.** Aujourd'hui : la direction ou le professeur principal de la classe (les autres professeurs ne pilotent pas). *Décider : garder ainsi, ou autoriser aussi un autre membre de la direction / la vie scolaire ?*
22. **Conseil de classe : l'écran projeté.** Il s'ouvre par un lien, sur un appareil connecté avec un compte de la direction ou du professeur principal. Par défaut : rang masqué, absences et appréciations des matières affichées (réglable pendant le conseil). Les remarques internes et les élèves « à revoir » ne sont jamais projetés. *Décider : réglages par défaut ; présence de parents et d'élèves délégués (si oui, faut-il masquer davantage, par exemple les moyennes des autres élèves ?).*
23. **Compte rendu du conseil.** Document interne (mentions, élèves à revoir, remarques), lu par la direction et le professeur principal. *Décider : à qui le transmettre (professeurs de la classe ?) et combien de temps le garder (étape 0b).*
24. **Photos des élèves.** La direction les ajoute (une par une ou en lot, fichiers « NOM_Prénom.jpg »), tout le personnel les voit, elles s'affichent sur l'écran du conseil. C'est une donnée personnelle (droit à l'image) : *décider de l'autorisation demandée aux familles (formulaire d'inscription ?), de qui les gère, et de leur suppression au départ de l'élève (étape 0b). Aucune vraie photo avant la mise en service.*
25. **Emploi du temps : grille horaire.** Grille de départ : 7 créneaux (8 h – 16 h 30, récréation 9 h 55 – 10 h 10, pause de midi 12 h 05 – 13 h 30) les lundi, mardi, jeudi, vendredi, et le mercredi matin. *Fournir les vrais horaires du collège (et samedi matin éventuel).*
26. **Emploi du temps : règles.** Aujourd'hui : 2 h au plus d'une même matière par jour pour une classe ; trous évités en priorité pour les élèves, puis pour les professeurs ; gymnase et salles imposées par enseignement. *Décider : semaines A/B (non gérées pour l'instant), contraintes des professeurs à recueillir (indisponibilités obligatoires ou simples préférences), salles réellement disponibles (gymnase seulement le mercredi pour les 4e/3e ?).*
27. **Emploi du temps : publication.** Publier crée tous les cours de la période (hors fermetures du calendrier) ; republier remplace les cours à venir, sauf ceux dont l'appel est déjà ouvert. Les professeurs voient l'emploi du temps, seule la direction le modifie. *Décider : qui publie, et à partir de quand (rentrée).*

## À compléter aux étapes suivantes
- Mise en service (étape 0b) : comptes, connexion sécurisée, retrait du mode test, conservation des données.
