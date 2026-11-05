# MagicNotes

Le carnet de création des créateurs de tours. C'est une web-app installable sur iPhone (PWA) : elle fonctionne hors-ligne, et toutes les données restent sur l'appareil, sans compte ni serveur.

## Installation sur iPhone
1. Ouvrir l'adresse de l'app dans **Safari** (GitHub Pages : `https://<utilisateur>.github.io/Test-medicament/magicnotes/`).
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. Lancer MagicNotes depuis l'icône : plein écran, comme une app native.

## Fonctionnalités
- **Carnets** avec couvertures géométriques génératives (8 motifs × 12 teintes) ou photo personnelle.
- **Thèmes & nuances** : chaque thème a sa couleur, et ses sous-catégories en sont des nuances (ex. *Idées de tours* en ambre, avec *Cartomagie*, *Pièces*, *Mentalisme*…). Les thèmes, couleurs et sous-catégories sont modifiables.
- **Recherche instantanée** dans les titres, le texte, les tags, les fiches techniques, les noms de fichiers et les transcriptions de vocaux. Elle ignore les accents, surligne les résultats et propose des filtres (thème, carnet, statut, photos, vidéos, vocaux, dessins, listes…).
- **Médias** : photos (galerie ou appareil photo), vidéos, mémos vocaux avec onde et transcription, **dessins** faits dans l'app (pression Apple Pencil, feutre, gomme, fonds quadrillé, ligné ou pointillé, dessin modifiable après coup), fichiers.
- **Fiche technique** pour un tour : effet, méthode, matériel, mise en place, crédits, durée, difficulté.
- **Mode discret** : le champ *Méthode* reste flouté tant qu'on ne le touche pas.
- **Atelier** : suivi de chaque création, de *Idée brute* à *Au répertoire*.
- **Modèles** : fiche tour, idée de méthode, routine & script, compte rendu de spectacle, notes de lecture.
- Listes à cocher, mise en forme, `#tags` automatiques, épinglage, notes « À redécouvrir », dictée.
- Thème clair / sombre / auto, trois tailles de texte, affichage en mosaïque ou en liste.
- **Sauvegarde** : export et import complets en `.json` (médias inclus), corbeille conservée 30 jours.

## Technique
HTML, CSS et JavaScript (modules ES), sans dépendance ni étape de build. Stockage IndexedDB, service worker pour le mode hors-ligne.
Pour tester en local : `python3 -m http.server` à la racine du dépôt, puis ouvrir `http://localhost:8000/magicnotes/`.
