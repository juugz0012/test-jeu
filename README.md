# TAPI — survivre sans un bruit

Petit jeu de survie / construction en PWA (HTML + Canvas, aucune dépendance, jouable hors ligne).

## L'histoire

Personne ne sait d'où ils sont venus. Un soir d'automne, les lumières de la vallée se sont
éteintes une à une, et les **Rôdeurs** sont sortis des bois.

Ils n'y voient presque rien. Mais ils **entendent tout** : une branche qui craque, une hache
contre un tronc, des pas trop pressés. Et la lueur d'un feu les attire comme des papillons de
nuit. Au premier rayon du soleil, ils tombent en cendres… jusqu'au soir suivant.

Tu es le dernier du convoi. Dans ton sac, une radio à manivelle répète le même message :
*« Hélicoptère d'évacuation — clairière nord — dans dix jours. Tenez bon. »*

Dix nuits. Le jour, coupe, taille, cueille, bâtis. La nuit, ne cours pas, ne frappe rien.
**Tapis-toi.**

## Comment jouer

- **Le jour** : récolte du bois (arbres), de la pierre (rochers) et des baies (buissons), puis construis.
- **La nuit** : une vague de Rôdeurs arrive, plus nombreuse chaque nuit. Ils te repèrent au **bruit**
  (anneau bleu autour de toi) ou s'ils te voient de tout près sans mur entre vous.
  - Immobile = silencieux · Discret = très peu de bruit · Courir = bruyant · Récolter / construire = très bruyant.
- **Constructions**
  - *Mur bois / Mur pierre* : bloquent le passage et la vue.
  - *Porte* : tu passes, pas eux.
  - *Piège* : 3 utilisations, tue un Rôdeur ordinaire d'un coup.
  - *Cachette* : dedans, tu es indétectable (sauf s'ils te poursuivaient déjà).
  - *Leurre* : feu qui s'allume la nuit et attire les Rôdeurs loin de toi.
  - *Démolir* : rend la moitié des ressources.
- Mange des baies pour ne pas mourir de faim. La santé remonte le jour si tu es nourri.
- Tiens **10 nuits** pour être évacué, puis continue en mode sans fin. La partie est sauvegardée à chaque aube.

| Action | Tactile | Clavier |
| --- | --- | --- |
| Se déplacer | joystick (pousser à moitié = discret) | ZQSD / flèches |
| Récolter | bouton ⛏️ (maintenir) | Espace / E |
| Discret | bouton 🤫 | Maj |
| Manger | bouton 🍒 en haut (affiche le nombre de baies) | F |
| Zoom | pincer, boutons + / − | + / −, molette |
| Pause et réglages | bouton ⚙️ | P |
| Construire | choisir un objet puis toucher une case | 1-7 puis clic |

## Accessibilité (basse vision)

Réglages accessibles depuis le menu et, en jeu, par le bouton ⚙️ (qui met aussi la partie en pause) :

- **Zoom du jeu** : pincer à deux doigts, boutons + / −, molette ou touches + / −.
- **Taille de l'interface** : textes, jauges et boutons de 75 % à 200 % (limité à ce que l'écran peut contenir).
- **Contraste élevé** (activé par défaut) : fonds noirs, bordures blanches, nuit moins sombre,
  contour blanc autour du joueur et contour coloré autour des Rôdeurs.
- **Sons d'alerte** : battement de cœur qui accélère quand un Rôdeur approche, double bip quand tu es repéré,
  sons distincts pour le crépuscule, la nuit, l'aube, la récolte et les coups.
- **Vibrations** (téléphones compatibles) : repéré, blessé, tombée de la nuit.
- **Flèches au bord de l'écran** : direction des Rôdeurs proches hors champ
  (jaune = il rôde, orange = attiré par un leurre, rouge = il te poursuit).

Les réglages sont mémorisés sur l'appareil.

## Lancer en local

```sh
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour l'installer comme application, il faut servir le dossier en HTTPS (par exemple GitHub Pages),
puis « Ajouter à l'écran d'accueil ».
