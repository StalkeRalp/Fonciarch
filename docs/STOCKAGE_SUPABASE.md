# Stockage Supabase et raccordement du frontend

## Installation

Le frontend utilise exclusivement les routes Next.js `/api/workspace` et `/api/files`. Le serveur contacte PostgreSQL et Supabase Storage avec la clé de `.env.local`. La clé secrète n’est pas transmise au navigateur.

Dans **Supabase → SQL Editor**, exécuter :

```text
supabase/INSTALLATION_COMPLETE.sql
```

Ce fichier regroupe les trois migrations dans l’ordre : registre, Storage et cadastres par titre. Il peut également être appliqué à un projet qui a déjà reçu la première migration. Il ne contient aucun compte, titre ou fichier de démonstration.

Si les tables du registre existent déjà et que vous préférez appliquer les nouveautés séparément, exécuter les migrations `202611120002_storage.sql` puis `202611120003_cadastres.sql`.

Le projet contient déjà ses variables locales. Sur un nouvel hébergement, renseigner uniquement dans les secrets serveur :

```dotenv
SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_SECRET_KEY=VOTRE_CLE_SB_SECRET
```

Ne jamais ajouter le préfixe NEXT_PUBLIC à la clé secrète. Puis lancer :

```sh
npm run supabase:check -- --storage
npm run build
npm start
```

La connexion distante n’a pas pu être confirmée depuis l’environnement de développement à cause d’une erreur DNS EAI_AGAIN. Les tests automatisés utilisent un transport Supabase simulé ; le SQL a été exécuté dans une base PostgreSQL isolée avec des tables Storage de recette. Effectuer une validation avec le vrai projet après exécution du script.

## Buckets créés

| Bucket privé | Contenu | Limite par fichier |
| --- | --- | --- |
| fonciarch-imports | Sources CSV, XLS et XLSX | 10 Mio |
| fonciarch-documents | PDF, JPEG et PNG, éventuellement associés à un titre | 20 Mio |
| fonciarch-exports | CSV, XLSX et PDF | 20 Mio |

L’interface Importation traite les titres depuis un fichier Excel .xlsx ou CSV UTF-8 de 4 Mo maximum et 5 000 lignes. Le modèle Excel présente une donnée par cellule et les en-têtes en ligne 1 de la feuille Titres. Toute erreur bloque le fichier entier avant confirmation. Le fichier source original est archivé après validation. Les anciens fichiers .xls doivent être réenregistrés en .xlsx pour l’import des titres.

Les limites du projet Supabase ou de l’hébergeur peuvent imposer une limite inférieure. Vérifier la configuration de l’hébergement avant de transférer les fichiers les plus volumineux.

## Parcours dans l’application

Dans Importation, sélectionner le fichier Excel .xlsx ou CSV, vérifier les lignes puis confirmer. Le fichier et les lignes valides sont enregistrés dans la même file locale. À la synchronisation, le serveur stocke d’abord le fichier source et ses métadonnées, puis applique l’import de titres. Une erreur de validation n’écrase jamais un titre existant.

Dans Fichiers, choisir le classement, éventuellement le titre lié, puis le fichier. Le fichier est conservé localement avant l’envoi. La liste distingue les copies locales en attente des fichiers stockés dans Supabase. Les fichiers distants se téléchargent par un lien signé valable 60 secondes. Les liens signés ne sont pas conservés dans la copie locale.

Les fichiers en attente restent téléchargeables depuis leur copie locale, même sans réseau. Les fichiers déjà reçus par Supabase nécessitent une connexion pour être téléchargés ; seule leur référence est conservée dans le navigateur. La fermeture de l’application suspend les envois et les reprend à la réouverture avec le réseau.

Dans Paramètres, l’export de copie locale inclut le contenu des fichiers en attente, encodé en base64. Il s’agit d’un fichier sensible à protéger comme les autres archives du service. Cet export n’inclut pas les fichiers binaires qui sont uniquement dans Storage.

## Intégrité et accès

Chaque fichier possède un identifiant stable, un chemin propre et une empreinte SHA-256. Un nouveau transfert du même fichier renvoie la référence précédente. Un contenu différent avec le même identifiant est refusé. L’application n’utilise pas l’écrasement automatique des objets.

Si le transfert Storage a abouti mais que l’enregistrement des métadonnées a été interrompu, le prochain essai vérifie l’empreinte de l’objet existant avant de compléter son enregistrement. Un fichier peut donc être présent dans Storage avant que son import de titres ait abouti ; les deux services ne constituent pas une transaction unique. Ne supprimer un objet non référencé qu’après vérification des files en attente et de la politique de conservation.

La table `public.fonciarch_files` conserve le nom original, le type, la taille, le chemin privé, l’empreinte, le titre éventuellement associé et l’identifiant de l’import. Le journal garde l’enregistrement du fichier. Les buckets restent privés ; une politique restrictive bloque les rôles anon et authenticated pour ces trois buckets, même s’il existe une autre politique permissive.

La clé serveur utilise le rôle service_role pour ces opérations. Dans l’état actuel, l’authentification de l’application est suspendue : toute personne qui atteint le serveur Next.js peut utiliser les écrans et leurs routes. Réactiver les sessions et les droits avant une exposition publique. Des buckets privés ne remplacent pas ce contrôle d’accès.

Le serveur contrôle l’extension, la taille et une signature de base des formats binaires, ainsi que l’encodage UTF-8 des CSV. Ce contrôle n’est pas un antivirus ni une analyse complète du contenu des classeurs et PDF. Pour des apports externes non maîtrisés, prévoir une analyse adaptée avant leur diffusion aux agents.

## Vérifications après installation

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('fonciarch-imports', 'fonciarch-documents', 'fonciarch-exports');

select has_table_privilege('anon', 'public.fonciarch_files', 'SELECT');
select has_function_privilege('anon', 'public.fonciarch_register_file(jsonb)', 'EXECUTE');
```

Les buckets doivent afficher public = false, et les deux vérifications de droits doivent renvoyer false. Tester aussi le refus d’un téléchargement direct avec la clé publique sur le projet réel, ainsi que le téléchargement par l’application.

Déposer un CSV, vérifier son objet et sa ligne dans fonciarch_files, puis répéter une synchronisation après coupure : le fichier ne doit pas être dupliqué. Couper ensuite le réseau, déposer un document et vérifier sa présence locale après fermeture et réouverture. La copie locale et le transfert ne doivent pas dépendre d’une alerte flottante.

## Ajout d’un titre et cadastres

Le champ Box accepte un numéro : saisir 15 affiche Box 15. À l’enregistrement d’un nouveau titre, le box manquant et le titre sont ajoutés atomiquement dans la file locale. Le serveur réutilise le box s’il a été créé entre-temps par un autre agent.

La liste des cadastres affiche Mfoundi A, Mfoundi B et Mfoundi C, ainsi que le cadastre configuré pour le service s’il est différent. Le choix est conservé dans la fiche et dans les exports. Les doublons sont contrôlés sur numéro, catégorie et cadastre. Les boxes conservent un numéro global dans le registre physique du service ; ils ne sont pas dupliqués automatiquement par cadastre.

Pour corriger un emplacement existant, utiliser Déplacer afin de conserver le motif et l’historique.

## Sauvegardes

Une sauvegarde PostgreSQL ne suffit pas à récupérer les octets des fichiers Storage. Prévoir séparément l’export des objets, les métadonnées et un test de restauration. La restauration JSON du registre n’est pas une sauvegarde des buckets. Les scripts fournis ne configurent pas automatiquement une sauvegarde planifiée.

Références officielles : [création des buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [contrôle des accès Storage](https://supabase.com/docs/guides/storage/security/access-control), [formats de clés](https://supabase.com/docs/guides/api/api-keys).
