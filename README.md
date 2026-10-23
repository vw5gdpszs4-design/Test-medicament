# Test-medicament

- `index.html` : suivi d'heures par projet.
- `notes/` : **fausse app Notes** pour un tour de cartes (jeu ordonné, carte et position nommées par le spectateur).

## Fausse app Notes — mode d'emploi

1. Ouvrir `notes/index.html` dans Safari sur l'iPhone, puis *Partager → Sur l'écran d'accueil*.
2. Nouvelle note : 1ʳᵉ ligne la carte (`9 de pique`, `Dame de cœur`, `As♦`…), 2ᵉ ligne la position (`28`).
3. 1,2 s après la dernière frappe (ou en touchant « OK »), **les minutes de la date grise en haut
   de la note = numéro de la carte sur laquelle couper** (ex. « 23 octobre 2026 à 09:27 » → carte n°27).
   L'heure réelle revient après 3 min (réglable) ou à la création d'une nouvelle note.

**Réglages secrets** : appui long (~1 s) sur le grand titre « Notes » de la liste.
Langue de l'app : français, anglais ou espagnol (la carte peut être écrite dans l'une des trois langues : « 7 de cœur », « seven of hearts », « siete de corazones », « 7♥ »).
Choix de l'ordre (Mnemonica par défaut, Aronson, jeu neuf, ou ordre personnalisé), convention de coupe,
durée des minutes forcées, et un simulateur pour répéter.

Les numéros marqués sur les cartes sont supposés être leur position dans l'ordre (carte n°1 = dessus du jeu).

### Calcul
Carte nommée en position `p`, position voulue `t`, 52 cartes :
- « la carte coupée passe dessous » (défaut) : couper sur `x = (p − t) mod 52` (0 → 52) ;
- « la carte coupée passe dessus » : `x = (p − t + 1) mod 52` (0 → 52).

Ex. Mnemonica : 7♥ est n°41, voulu en 14 → couper sur la carte n°27, la date de la note affiche `hh:27`.
