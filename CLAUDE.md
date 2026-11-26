# Luqmân Campus — consignes pour Claude

- Appli de vie scolaire du collège Luqmân (alternative simplifiée à Pronote). Réponses en français.
- Roadmap : `docs/` (fiche de route, étapes). Journal de travail : `JOURNAL.md` (à lire en début de session, à compléter en fin).
- AUCUNE vraie donnée d'élève avant le déploiement (étape 0b). Données fictives uniquement.
- Jamais de mot de passe, clé ou jeton dans le dépôt.
- Toute modification de la base passe par un fichier dans `supabase/migrations/` et doit garder `npm run test:db` au vert.
- Un travail = une branche + une pull request. Pas de push direct sur `main` une fois le directeur sur le projet.
