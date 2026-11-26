# Luqmân Campus — consignes pour Claude

- Appli de vie scolaire du collège Luqmân (alternative simplifiée à Pronote). Réponses en français.
- Roadmap : `docs/` (fiche de route, étapes). Journal de travail : `JOURNAL.md` (à lire en début de session, à compléter en fin).
- AUCUNE vraie donnée d'élève avant le déploiement (étape 0b). Données fictives uniquement.
- Jamais de mot de passe, de clé secrète (service_role) ni de jeton dans le dépôt. Seule la clé publique de Supabase (publishable/anon, conçue pour être visible) peut y figurer.
- Toute modification de la base passe par un fichier dans `supabase/migrations/` et doit garder `npm run test:db` au vert.
- Un travail = une branche + une pull request. Pas de push direct sur `main` une fois le directeur sur le projet.
- `supabase/dev_only/` : scripts à usage de test uniquement (accès libre temporaire). Ils ne sont jamais appliqués à la production et doivent être retirés avant l'étape 0b (`docs/ETAPE-0B.md`).
