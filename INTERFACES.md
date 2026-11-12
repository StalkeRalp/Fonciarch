# Interfaces FONCIARCH

Les écrans lisent la copie locale IndexedDB et ajoutent les écritures à une file persistante. Celle-ci est synchronisée avec l’API Next.js et le stockage serveur Supabase.

Le tableau de bord s’ouvre directement sans authentification. La navigation latérale reste fixe. Les logos du projet et du ministère, les polices locales Coustard et Crete Round, les thèmes clair/sombre et la progression de page sont conservés.

- Tableau de bord : statistiques et activité issues des données visibles sur l’appareil.
- Recherche et registre : titres disponibles localement, filtres et export CSV.
- Fiche titre : box saisi en chiffres avec aperçu et création locale automatique, cadastre visible et conservé, correction, statut et déplacement motivé, y compris hors connexion.
- Boxes et séries : contenu réel du registre local.
- Import Excel .xlsx et CSV : modèles Excel vierge et exemple, aperçu par cellules, blocage complet en cas d’erreur, vérification et ajout dans la file ; import serveur transactionnel.
- Historique : journal serveur et opérations locales en attente explicitement identifiées.
- Rapports : données locales visibles et export, même sans réseau.
- Paramètres : identité du service, apparence, installation PWA, état de synchronisation, copie JSON et résolution des conflits.

Le mode hors connexion nécessite une première préparation en ligne de la version de production. Les envois reprennent lorsque l’application est ouverte et le serveur accessible. L’état est intégré à l’en-tête et aux paramètres, sans publicité ni alerte flottante.

Voir le guide dans `docs/INTEGRATION_SUPABASE.md` pour l’intégration cloud et la recette.

- Fichiers : dépôt privé de sources, pièces jointes et rapports, file hors ligne et téléchargement temporaire signé depuis Supabase.
