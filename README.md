# FONCIARCH

Gestion des titres fonciers, boxes, recherche, import Excel .xlsx et CSV, journal et rapports. Supabase est l’unique backend.

## Configuration

Node.js 24 minimum. Copier `.env.example` vers `.env.local`, renseigner `SUPABASE_URL` et la clé serveur `SUPABASE_SECRET_KEY`, puis exécuter `supabase/INSTALLATION_COMPLETE.sql` dans le SQL Editor Supabase.

Une clé `sb_publishable_…` ou un JWT de rôle `anon` est public et ne remplace pas la clé serveur. Les clés publiques facultatives restent sous `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_ANON_KEY`. Le fichier `.env.local` est exclu du dépôt et ne doit pas être publié.

`npm run supabase:check` teste uniquement la RPC de lecture, sans afficher de clé ni de fiche du registre. La connectivité et la présence du schéma dans le projet distant doivent être vérifiées : une erreur DNS a empêché leur confirmation dans l’environnement de développement.

## Démarrage

`npm install`, puis `npm run dev` pour développer. En production : `npm run build`, puis `npm start`. Le build prépare les ressources de la PWA. L’authentification reste suspendue à la demande du projet ; le tableau de bord s’ouvre directement.

Il n’existe aucun sélecteur de backend, aucun moteur serveur local et aucun mécanisme de repli. Une configuration incorrecte ou une indisponibilité de Supabase est signalée ; les saisies locales restent en attente.

## Fonctionnement hors connexion

IndexedDB conserve la copie du registre et une file locale des saisies. Il ne s’agit pas d’un second backend : les envois passent exclusivement par Supabase. Les opérations ont un identifiant stable et un reçu pour éviter les doublons après une coupure. Les conflits se traitent dans Paramètres, sans fenêtre d’alerte automatique.

Ouvrir une première fois l’application de production en ligne sous HTTPS ou sur localhost afin de préparer les ressources et les données. Fermer l’application suspend les envois mais conserve les saisies ; leur synchronisation reprend lorsque l’application est ouverte et Supabase accessible.

Ne pas effacer les données du navigateur avec des saisies en attente. Le stockage dépend de l’adresse du site et du profil du navigateur. L’export de copie locale est disponible dans Paramètres. Les anciennes copies de données serveur, si elles existent, ne sont ni utilisées ni effacées automatiquement.

## Guide et vérifications

Voir [le guide complet](docs/INTEGRATION_SUPABASE.md), [le PDF](output/FONCIARCH_Guide_Supabase.pdf) et la migration SQL dans `supabase/migrations`.

- `npm run typecheck`
- `npm run lint`
- `npm test` pour le contrat REST Supabase simulé, les types de clés, la file hors ligne et le cache PWA.
- `supabase/tests/validation.sql` uniquement sur une base PostgreSQL de test vide, après la migration.

Les tests simulés ne remplacent pas un essai avec le projet Supabase réel ni la recette d’installation et de stockage dans les navigateurs des agents.

## Périmètre

Un service, plusieurs cadastres enregistrés par titre ; catégories A/B/C ; série indicative à confirmer. Le registre est chargé en entier : pagination et synchronisation incrémentale restent nécessaires pour les volumes importants. L’import Excel .xlsx utilise la feuille Titres et les colonnes du modèle téléchargeable. Les anciens .xls doivent être réenregistrés en .xlsx. La gestion des prêts et les sauvegardes automatiques restent à développer.

Avant une exposition sur Internet, rétablir les sessions et les permissions vérifiées côté serveur. Le stockage local métier n’est pas chiffré par l’application ; protéger les appareils et les copies exportées.

## Stockage des fichiers

Voir [le guide Storage](docs/STOCKAGE_SUPABASE.md). Les trois buckets privés conservent les sources d’import, les documents associés aux titres et les exports. Les fichiers en attente sont conservés dans IndexedDB puis transmis à Supabase. `npm run supabase:check -- --storage` vérifie le registre et les buckets depuis un réseau autorisant l’accès au projet.
