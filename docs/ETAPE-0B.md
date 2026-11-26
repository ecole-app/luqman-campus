# Étape 0b — passage en production (au déploiement, avant toute vraie donnée d'élève)

Liste à cocher. Rien de ceci n'est fait tant que l'appli ne tourne qu'avec des données fictives.

- [ ] **Retirer l'accès libre** du projet de test : lancer `supabase/dev_only/retirer_acces_libre.sql`, puis vérifier qu'un visiteur non connecté ne voit plus rien (`npm run test:db` couvre ce contrôle).
- [ ] Repasser l'appli en connexion obligatoire (comptes réels, double authentification pour gestionnaire, admin, direction, vie scolaire).
- [ ] Passer Supabase en offre payante avec sauvegardes quotidiennes, tester une restauration complète.
- [ ] Repartir d'une base vide (script de nettoyage des données fictives).
- [ ] Nom de domaine du collège et HTTPS.
- [ ] Contrôle RGPD avec le directeur (mention d'information, durées de conservation, registre).
- [ ] Vérifier qu'aucune clé secrète (service_role) n'est dans le dépôt ; seule la clé publique y figure.
