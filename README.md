# Test-medicament

## Contractions

`contractions.html` est une web app installable (Ajouter à l'écran d'accueil) pour
suivre les contractions pendant le travail :

- Chronomètre départ/fin pour chaque contraction (durée calculée automatiquement).
- Intensité (légère / modérée / forte) saisie à la volée ou modifiable dans le journal.
- Calcul de l'intervalle entre chaque contraction (fréquence) et statistiques
  (intervalle moyen, durée moyenne, nombre sur la dernière heure).
- Graphique en barres montrant le temps écoulé entre chaque contraction, pour
  visualiser si elles se rapprochent.
- Ajout manuel d'une contraction passée, suppression, réinitialisation.
- Fonctionne hors-ligne (service worker) et s'installe comme une application
  (manifeste + icônes dans `icons/`).

Ceci est un outil de suivi personnel, pas un dispositif médical : en cas de doute,
contactez votre sage-femme ou votre maternité.
