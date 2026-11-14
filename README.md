# FONCIARCH

**FONCIARCH** est une application web progressive (PWA) de classement et de consultation des titres fonciers. Elle permet d’organiser les titres par conservation, série, cadastre et box, d’effectuer des recherches, de préparer des imports Excel/CSV et de conserver des documents dans Supabase Storage.

Le projet utilise **Next.js et React** pour l’interface, **Supabase/PostgreSQL** comme backend unique et **IndexedDB** pour continuer à consulter et saisir des opérations lorsque le réseau est indisponible.

> **État de sécurité à lire avant déploiement public** — l’authentification de l’application est actuellement suspendue. Les routes serveur de lecture et d’écriture ne vérifient pas l’identité d’un utilisateur. Une personne ayant l’adresse du site peut donc accéder aux données et utiliser ces routes. Ne reliez pas une instance publique aux données foncières réelles avant d’avoir rétabli une authentification et des autorisations côté serveur. Les politiques Supabase et les buckets privés ne protègent pas les routes serveur de l’application.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation locale](#installation-locale)
- [Configuration de Supabase](#configuration-de-supabase)
- [Démarrer et construire](#démarrer-et-construire)
- [Utilisation](#utilisation)
- [Importer des titres](#importer-des-titres)
- [Mode hors connexion et synchronisation](#mode-hors-connexion-et-synchronisation)
- [Fichiers et stockage](#fichiers-et-stockage)
- [Déploiement](#déploiement)
- [Commandes utiles](#commandes-utiles)
- [Structure du dépôt](#structure-du-dépôt)
- [Limites connues](#limites-connues)
- [Documentation complémentaire](#documentation-complémentaire)

## Fonctionnalités

- Tableau de bord, recherche, filtres et consultation du registre des titres.
- Création et modification des titres fonciers : numéro, conservation, cadastre, box, statut et observations.
- Suppression d’un titre depuis sa fiche.
- Création et modification des boxes ; leurs titres associés suivent le nouveau numéro lors d’un renommage.
- Suppression d’un box vide. Un box contenant des titres doit d’abord être vidé.
- Déplacement d’un titre vers un box existant, avec motif conservé dans l’historique.
- Import de fichiers Excel `.xlsx` et CSV UTF-8. Les boxes présents dans un fichier sont créés automatiquement s’ils n’existent pas.
- Journal d’activité, rapports et export CSV.
- Dépôt de fichiers dans des buckets Supabase Storage privés.
- Thèmes clair et sombre, installation PWA et ressources d’interface mises en cache.
- File de saisies hors ligne, conservation locale et synchronisation différée avec Supabase.

## Architecture

```text
Navigateur (Next.js / React / PWA)
  ├── Interface et service worker
  ├── IndexedDB : copie locale et opérations en attente
  └── API Next.js (/api/workspace, /api/files)
        └── Supabase REST / fonctions PostgreSQL / Storage
```

Supabase est l’unique backend central. IndexedDB est une copie de travail sur l’appareil et une file d’attente ; ce n’est pas un serveur alternatif. La clé Supabase privilégiée est utilisée uniquement dans le code serveur. Elle ne doit jamais être incluse dans le bundle navigateur.

Le schéma conserve les numéros comme du texte afin de garder les zéros initiaux. La série est calculée à partir du premier chiffre du numéro (de 0 à 9). La conservation est A, B ou C. L’unicité métier d’un titre est contrôlée par son numéro, sa conservation et son cadastre.

## Prérequis

- Node.js **24 ou ultérieur** (voir `engines` dans `package.json`).
- npm.
- Un projet Supabase pour le développement, avec accès à son SQL Editor et à ses variables serveur.
- Un navigateur moderne. HTTPS est requis pour l’usage PWA hors `localhost`.

## Installation locale

```bash
git clone <URL_DU_DEPOT>
cd fonciarch
npm install
cp .env.example .env.local
```

Renseigner ensuite les variables Supabase décrites ci-dessous. Ne jamais committer `.env.local` ni transmettre une clé secrète dans le code, une capture ou un message.

## Configuration de Supabase

### 1. Variables d’environnement

Dans `.env.local`, renseigner les informations du projet :

```dotenv
SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_SECRET_KEY=VOTRE_CLE_SERVEUR
```

`SUPABASE_SECRET_KEY` est exclusivement une variable serveur. **Ne pas** la renommer en `NEXT_PUBLIC_SUPABASE_SECRET_KEY` et ne pas la placer dans un fichier lu par le navigateur. Les variables `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_ANON_KEY` sont facultatives pour le mode actuel et ne remplacent pas la clé serveur.

### 2. Créer le schéma

Pour une nouvelle base, exécuter dans le SQL Editor Supabase, dans cet ordre, les migrations du dossier `supabase/migrations` :

1. `202611120001_fonciarch.sql`
2. `202611120002_storage.sql`
3. `202611120003_cadastres.sql`
4. `202611120004_import_auto_boxes.sql`
5. `202611140001_manage_records.sql`

La dernière migration ajoute les opérations de modification et de suppression des titres et boxes. Si une base utilise déjà les migrations précédentes, exécuter seulement la migration manquante `202611140001_manage_records.sql`.

Le dépôt contient également `supabase/INSTALLATION_COMPLETE.sql` et `supabase/MISE_A_JOUR_SYNCHRONISATION.sql`, des scripts historiques/consolidés. Pour éviter de déployer un schéma incomplet, privilégier la suite ordonnée des migrations ci-dessus, en particulier pour une nouvelle installation.

### 3. Vérifier la connexion

Après avoir démarré le serveur local, lancer :

```bash
npm run supabase:check
```

Cette commande vérifie la lecture du workspace depuis Supabase. Pour inclure les buckets de stockage :

```bash
npm run supabase:check -- --storage
```

Une erreur de configuration, de réseau ou de migration doit être corrigée avant d’ajouter des données. Les scripts de contrôle n’affichent pas volontairement les clés secrètes.

## Démarrer et construire

Développement :

```bash
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000).

Build de production et lancement local du build :

```bash
npm run build
npm start
```

Le build exécute Next.js et prépare les ressources nécessaires à la PWA. L’application comprend une page d’accueil (`/`), l’espace de travail (`/application`) et les API serveur (`/api/workspace`, `/api/files`, `/api/files/link`).

## Utilisation

1. Ouvrir l’application et renseigner le nom et la localisation du service dans **Paramètres**.
2. Créer les boxes nécessaires ou laisser l’import les créer automatiquement.
3. Ajouter les titres depuis **Titres fonciers** ou les importer.
4. Ouvrir la fiche d’un titre pour modifier ses champs, le déplacer, l’exporter ou le supprimer.
5. Utiliser **Boxes** pour consulter le contenu, renommer ou supprimer les boxes vides.
6. Consulter les états de synchronisation et traiter les conflits depuis **Paramètres**.

Les suppressions sont définitives une fois synchronisées. Vérifier la fiche ou le box choisi avant de confirmer.

## Importer des titres

Formats acceptés : `.xlsx` et CSV UTF-8. La limite de taille et de nombre de lignes est affichée dans l’interface et détaillée dans [FORMAT_IMPORT_TITRES.md](docs/FORMAT_IMPORT_TITRES.md).

Le classeur Excel doit contenir une feuille nommée `Titres` (obligatoire si le classeur comporte plusieurs feuilles). Les en-têtes doivent être sur la première ligne. Les colonnes reconnues sont :

| Colonne | Requis | Exemple |
|---|---:|---|
| Numéro | Oui | `0034444` |
| Conservation | Oui | `A` |
| Box | Oui | `115` |
| Cadastre | Recommandé | `Mfoundi A` |
| Statut | Non | `Disponible` |

Le numéro du box est un entier positif, sans obligation de limite métier fixe. Un box absent du registre est créé automatiquement pendant l’import. Les statuts acceptés sont `Disponible`, `Sorti`, `Introuvable` et `Archivé`. Les observations ne sont pas importées par le modèle courant. Le numéro de série n’est pas une colonne à importer : il correspond au premier chiffre du numéro du titre.

La combinaison numéro + conservation + cadastre doit être unique. L’import est validé en lot : une erreur bloquante empêche l’enregistrement du fichier entier. Pour les consignes précises et les exemples, consulter [docs/FORMAT_IMPORT_TITRES.md](docs/FORMAT_IMPORT_TITRES.md).

## Mode hors connexion et synchronisation

Après une première ouverture en ligne, l’application peut conserver son interface, une copie des données chargées et les opérations en attente dans le navigateur. Les opérations sont enregistrées localement avant leur envoi. Une coupure réseau ne doit donc pas effacer une saisie ; celle-ci reste à synchroniser et est signalée dans l’application.

La synchronisation automatique est espacée (actuellement toutes les cinq minutes lorsque l’application est ouverte, visible et en ligne). Le bouton **Synchroniser maintenant** déclenche une synchronisation immédiate. La synchronisation s’interrompt lorsque l’application est fermée ; elle reprend lors d’une nouvelle ouverture avec accès réseau.

Les conflits sont conservés pour résolution explicite. Ne pas effacer les données du site, changer de navigateur/profil ou utiliser la navigation privée tant qu’il reste des opérations locales en attente. Les données locales ne sont pas chiffrées par l’application ; protéger les appareils et les exports.

## Fichiers et stockage

Les sources d’import, documents associés et exports sont stockés dans des buckets privés Supabase. L’application conserve les métadonnées dans le registre et utilise des liens temporaires pour accéder aux fichiers. Les transferts en attente hors ligne sont gardés dans IndexedDB jusqu’à leur envoi.

Consulter [docs/STOCKAGE_SUPABASE.md](docs/STOCKAGE_SUPABASE.md) pour les types de fichiers, les règles et les scripts de bucket. Les buckets privés ne remplacent pas la protection des API de l’application.

## Déploiement

Le résultat `npm run build` indique que le code compile et que les ressources PWA sont générées. Avant de publier :

- Configurer `SUPABASE_URL` et `SUPABASE_SECRET_KEY` dans le gestionnaire de secrets de l’hébergeur, côté serveur uniquement.
- Appliquer toutes les migrations dans l’ordre sur la base cible.
- Utiliser HTTPS et vérifier que le service worker fonctionne sur le domaine final.
- Réactiver une authentification robuste, contrôler les droits de chaque route API et protéger les fichiers avant d’utiliser des données réelles.
- Prévoir sauvegardes, restauration, surveillance et procédure de rotation des clés.

**Dans l’état actuel, une publication peut servir à une démonstration isolée avec des données fictives, mais elle ne doit pas être exposée publiquement avec le registre foncier réel.** Les routes API d’accès aux données ne sont pas protégées par une authentification utilisateur. Une simple restriction des tables Supabase ou un bucket privé ne corrige pas ce risque, car le serveur utilise une clé privilégiée.

## Commandes utiles

| Commande | Utilité |
|---|---|
| `npm run dev` | Lancer le serveur de développement |
| `npm run build` | Compiler l’application et préparer la PWA |
| `npm start` | Servir le build de production |
| `npm run typecheck` | Vérifier les types TypeScript |
| `npm run lint` | Lancer ESLint |
| `npm test` | Exécuter les scripts de vérification du dépôt |
| `npm run supabase:check` | Vérifier la lecture Supabase |
| `npm run supabase:check -- --storage` | Vérifier aussi le stockage |
| `npm run test:offline` | Vérifier le comportement de la file hors ligne |
| `npm run test:import` | Vérifier la lecture des classeurs Excel |
| `npm run test:sync` | Vérifier la cadence de synchronisation |

## Structure du dépôt

```text
src/app/                 Pages Next.js, styles globaux et routes API
src/components/           Interface, espace de travail et composants PWA
src/lib/                  Accès Supabase, modèles métier et logique hors ligne
supabase/migrations/       Migrations PostgreSQL et Storage, à appliquer dans l’ordre
supabase/tests/            Scripts SQL de validation
scripts/                  Vérifications, tests, préparation PWA et outils Supabase
docs/                     Guides d’intégration, stockage et format d’import
public/                   Logos, modèles d’import, manifeste et ressources statiques
Coustard/                 Fichiers de police Coustard
Crete_Round/              Fichiers de police Crete Round
```

## Limites connues

- L’authentification et les permissions par utilisateur ne sont pas actives dans cette version.
- Le workspace complet est chargé côté application ; une pagination et une synchronisation incrémentale seront nécessaires pour des registres très volumineux.
- La synchronisation en arrière-plan n’est pas garantie lorsque le navigateur est fermé.
- IndexedDB est propre à un navigateur, un profil et une origine ; ce n’est pas une sauvegarde centrale.
- Toute évolution SQL doit être appliquée aux environnements existants avec une migration, et non seulement modifiée dans le code local.

## Documentation complémentaire

- [Intégration Supabase et fonctionnement hors connexion](docs/INTEGRATION_SUPABASE.md)
- [Format des fichiers d’import](docs/FORMAT_IMPORT_TITRES.md)
- [Stockage des fichiers et buckets](docs/STOCKAGE_SUPABASE.md)
- [Présentation des interfaces](INTERFACES.md)
