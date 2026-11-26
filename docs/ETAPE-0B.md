# Étape 0b — passage en production (au déploiement, avant toute vraie donnée d'élève)

Liste à cocher. Rien de ceci n'est fait tant que l'appli ne tourne qu'avec des données fictives.

- [ ] **Retirer l'accès libre** du projet de test : lancer `supabase/dev_only/retirer_acces_libre.sql`, puis vérifier qu'un visiteur non connecté ne voit plus rien (`npm run test:db` couvre ce contrôle).
- [ ] Repasser l'appli en connexion obligatoire (comptes réels, double authentification pour gestionnaire, admin, direction, vie scolaire).
- [ ] Passer Supabase en offre payante avec sauvegardes quotidiennes, tester une restauration complète.
- [ ] Repartir d'une base vide (script de nettoyage des données fictives).
- [ ] Nom de domaine du collège et HTTPS.
- [ ] Contrôle RGPD avec le directeur (mention d'information, durées de conservation, registre).
- [ ] Vérifier qu'aucune clé secrète (service_role) n'est dans le dépôt ; seule la clé publique y figure.
- [ ] **Copie hors ligne sur les téléphones** : l'appli garde sur l'appareil la liste des élèves et les cours du jour (pour faire l'appel sans réseau). À la connexion sécurisée, vider cette copie à la déconnexion (clés `lc_*` du stockage local) et la limiter au personnel connecté.
- [ ] **Durées de conservation** (vie scolaire, infirmerie, incidents, observations confidentielles) à fixer avec le directeur et à appliquer (purge). Le journal d'audit est immuable : décider de sa durée aussi.
- [ ] **Masquer les boutons selon le rôle** une fois la connexion en place (aujourd'hui tout le monde voit tout en mode test ; le serveur refuse déjà ce qui n'est pas permis).
- [ ] Mettre à jour la librairie Supabase intégrée (`app/vendor/supabase-*.js`) si une nouvelle version corrige une faille.
