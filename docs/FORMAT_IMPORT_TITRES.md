# Format d’import des titres

L’import de titres accepte directement **Excel .xlsx**, avec une donnée dans chaque cellule : 4 Mo et 5 000 titres maximum. Aucun séparateur à saisir. Pour un ancien fichier .xls, choisir « Enregistrer sous → Classeur Excel (.xlsx) ». Le CSV UTF-8 reste accepté. Les PDF et images sont archivés dans Fichiers, sans création automatique de titres.

Utiliser une feuille nommée **Titres** (obligatoire avec plusieurs feuilles). Mettre les en-têtes en ligne 1, puis les données dès la ligne 2, dans les colonnes A à E : **Numéro, Catégorie, Box, Cadastre, Statut**. Ne pas utiliser de formules, de cellules fusionnées ou de lignes masquées. Les listes de catégorie et de statut du modèle proposent les valeurs attendues.

| Colonne | Contenu | Obligation |
|---|---|---|
| Numéro | Chiffres uniquement ; conserver le format texte pour les zéros initiaux | Obligatoire |
| Catégorie | A, B ou C | Obligatoire |
| Box | Numéro seul, par exemple 15 ; emplacement à créer avant l’import | Obligatoire |
| Cadastre | Nom exact, par exemple Mfoundi A ; garder une orthographe identique | Conseillé ; cadastre du service si absent ou vide |
| Statut | Disponible, Sorti, Introuvable ou Archivé | Facultatif ; Disponible par défaut |
| Série | Facultative ; calculée depuis le premier chiffre et la catégorie | Ignorée lors de l’import |

Exemple fictif à remplacer, chaque élément étant dans sa cellule :

| Numéro | Catégorie | Box | Cadastre | Statut |
|---|---|---|---|---|
| 00125 | A | 15 | Mfoundi A | Disponible |
| 00126 | B | 15 | Mfoundi A | Archivé |
| 00125 | A | 16 | Mfoundi B | Disponible |

Créer les boxes 15 et 16 avant cet exemple. Une ligne représente un titre. Ne pas ajouter de titre de document avant les en-têtes, de cellules fusionnées, de sous-totaux ou de séparateurs supplémentaires. Chaque colonne doit avoir un nom unique et chaque ligne le même nombre de colonnes. Les colonnes supplémentaires, dont les observations, ne sont pas importées actuellement.

La combinaison **Numéro + Catégorie + Cadastre** doit être unique dans le fichier et dans le registre. Changer le box ne permet pas de réimporter un titre existant : utiliser le déplacement de titre. Les zéros initiaux des numéros sont conservés ; ne pas alterner 00125 et 125 pour désigner le même titre. Les noms de cadastre doivent garder la même casse, les mêmes accents et espaces pour éviter des cadastres distincts par erreur.

Une erreur ou un doublon détecté bloque tout le fichier. Corriger les lignes signalées puis recharger. La confirmation reste nécessaire avant l’enregistrement. Si un conflit apparaît lors de la synchronisation avec un autre appareil, l’opération reste signalée dans le panneau de synchronisation sans écraser les titres existants.

Modèles disponibles dans l’application et sous public/modeles : titres-vierge.xlsx et titres-exemple.xlsx. Le modèle vierge ne contient aucun titre ; le fichier exemple contient uniquement des données pédagogiques fictives.
