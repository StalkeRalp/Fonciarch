# Format d’import des titres

L’import de titres accepte directement **Excel .xlsx**, avec une donnée dans chaque cellule : 4 Mo et 5 000 titres maximum. Aucun séparateur à saisir. Pour un ancien fichier .xls, choisir « Enregistrer sous → Classeur Excel (.xlsx) ». Le CSV UTF-8 reste accepté. Les PDF et images sont archivés dans Fichiers, sans création automatique de titres.

Utiliser une feuille nommée **Titres** (obligatoire avec plusieurs feuilles). Mettre les en-têtes en ligne 1, puis les données dès la ligne 2, dans les colonnes A à E : **Numéro, Conservation, Box, Cadastre, Statut**. Ne pas utiliser de formules, de cellules fusionnées ou de lignes masquées. Les listes de conservation et de statut du modèle proposent les valeurs attendues.

| Colonne | Contenu | Obligation |
|---|---|---|
| Numéro | Chiffres uniquement ; conserver le format texte pour les zéros initiaux | Obligatoire |
| Conservation | A, B ou C | Obligatoire |
| Box | Numéro seul, par exemple 15 ; créé automatiquement s’il manque | Obligatoire |
| Cadastre | Nom exact, par exemple Mfoundi A ; garder une orthographe identique | Conseillé ; cadastre du service si absent ou vide |
| Statut | Disponible, Sorti, Introuvable ou Archivé | Facultatif ; Disponible par défaut |
| Série | Facultative ; calculée depuis le premier chiffre du numéro du titre | Ignorée lors de l’import |

Exemple fictif à remplacer, chaque élément étant dans sa cellule :

| Numéro | Conservation | Box | Cadastre | Statut |
|---|---|---|---|---|
| 00125 | A | 15 | Mfoundi A | Disponible |
| 00126 | B | 15 | Mfoundi A | Archivé |
| 00125 | A | 16 | Mfoundi B | Disponible |

Les boxes 15 et 16 seront créés automatiquement s’ils n’existent pas. Une ligne représente un titre. Ne pas ajouter de titre de document avant les en-têtes, de cellules fusionnées, de sous-totaux ou de séparateurs supplémentaires. Chaque colonne doit avoir un nom unique et chaque ligne le même nombre de colonnes. Les colonnes supplémentaires, dont les observations, ne sont pas importées actuellement.

La combinaison **Numéro + Conservation + Cadastre** doit être unique dans le fichier et dans le registre. Changer le box ne permet pas de réimporter un titre existant : utiliser le déplacement de titre. Les zéros initiaux des numéros sont conservés ; ne pas alterner 00125 et 125 pour désigner le même titre. Les noms de cadastre doivent garder la même casse, les mêmes accents et espaces pour éviter des cadastres distincts par erreur.

Une erreur ou un doublon détecté bloque tout le fichier. Corriger les lignes signalées puis recharger. La confirmation reste nécessaire avant l’enregistrement. Si un conflit apparaît lors de la synchronisation avec un autre appareil, l’opération reste signalée dans le panneau de synchronisation sans écraser les titres existants.

Modèles disponibles dans l’application et sous public/modeles : titres-vierge.xlsx et titres-exemple.xlsx. Le modèle vierge ne contient aucun titre ; le fichier exemple contient uniquement des données pédagogiques fictives.

La série est le premier chiffre du numéro du titre, entre 0 et 9 : 34444 A → série 3, conservation A ; 0125 B → série 0, conservation B. La lettre de conservation ne fait pas partie du numéro de série. La colonne Série est calculée et ne doit pas être saisie. Les anciens fichiers portant l’en-tête Catégorie restent acceptés, mais ne doivent pas contenir aussi Conservation.
