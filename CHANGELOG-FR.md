# Gwent Classic 2.0 — journal des modifications

Version de travail basée sur [asundr/gwent-classic](https://github.com/asundr/gwent-classic).

## Affichage et entrées
- Le jeu est une scène 16:9 mise à l'échelle dans la fenêtre (bandes latérales floutées si le format diffère) : plus aucune barre de défilement ni défilement parasite, quelle que soit la taille de la fenêtre ou la mise à l'échelle Windows.
- Touchpad : le défilement à deux doigts fait défiler les carrousels (cartes, chefs, factions, défausse) et les listes du deck ; le pincement ne zoome plus la page ; l'appui à deux doigts ouvre le zoom de la carte.
- Clic droit (ou appui long en tactile) sur n'importe quelle carte, y compris sur le plateau et pendant le tour adverse : zoom de la carte avec sa description. Un clic, Échap ou la molette le ferme.
- Clavier : Échap annule la sélection / ferme le carrousel / ouvre le menu Quitter ; ←/→ et Entrée dans les carrousels ; F11 ou Alt+Entrée pour le plein écran.
- Les cartes ne « sautent » plus au survol (elles s'éloignaient du pointeur) ; les cibles possibles du Leurre clignotent.

## Français
- Interface, notifications, popups, deck, fin de partie entièrement en français ; bascule FR/EN en haut à droite du menu.
- Noms des cartes, capacités, chefs et factions d'après la VF officielle de The Witcher 3 et le manuel officiel du Gwynt (CD PROJEKT RED).
- Le texte anglais imprimé sur les grandes cartes est effacé et remplacé par le nom français (les rubans de faction sont conservés).

## Difficulté
- Facile / Normal / Difficile (en haut à gauche du menu du deck, mémorisé).
- Normal ne passe plus quand il est mené (il offrait la manche).
- Difficile joue sans hasard : espions en premier, victoire de manche au moindre coût, plus de Leurre/Espion joué « pour gagner », ne s'épuise pas en manche 1, gestion de l'avantage de cartes.
- Facile garde sa main de départ et joue presque au hasard.

## Règles et bugs corrigés
- Rassemblement ne prend plus que les cartes du paquet (règle TW3), plus celles de la main.
- Leurre : 0 point garanti (le Moral lui ajoutait +1).
- Vengeur (Vache, Kambi) : l'unité invoquée quitte bien la défausse.
- Nouvelle partie : plus de double carte de chef ni de défausse de la partie précédente.
- « Reprendre » après « Quitter » rendait le plateau inutilisable (corrigé, et Échap respecte le tour en cours).
- Pioche d'ouverture : chaque pioche réserve sa carte (le code ne marchait que par accident).
- Import de deck : réécrit (fautes de variable, boutons inversés, deck perdu au redémarrage, doublons fusionnés), messages dans le jeu au lieu des boîtes du navigateur.
- IA : poids négatifs, Tempête de Skellige mal évaluée, Eredin Roi de la Chasse sauvage sans météo, cor/mardrome sans ligne valide, médecin, taille de main jamais mise à jour.
- Divers : retrait d'éléments déjà déplacés, fondus concurrents, sons qui pouvaient bloquer une attente, police de repli sur Windows (Arial Narrow absent), fautes de frappe.

## Application de bureau
- Electron remplacé par **Tauri 2** (Rust + WebView2 intégré à Windows) : installateur de 52 Mo au lieu de 144 Mo, pas de second Chromium embarqué, fenêtre native (taille/position mémorisées, instance unique), export de deck par la vraie boîte « Enregistrer sous », installation sans droits administrateur et remplacement automatique de la version 1.x.
