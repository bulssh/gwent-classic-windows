# Gwent Classic — journal des modifications

Version de travail basée sur [asundr/gwent-classic](https://github.com/asundr/gwent-classic).

# Version 2.3

## Partie en ligne 1v1 (nouveau)
- Icône globe en haut à droite du menu du deck : « Créer une partie » (code de 6 caractères à copier et donner à l'adversaire) ou « Rejoindre une partie » (saisir le code).
- Salon : les deux joueurs apparaissent avec leur nom et leur portrait, choisissent leur deck dans une liste (decks incomplets grisés) et se déclarent « Prêt » ; l'hôte lance la partie quand les deux sont prêts, et les deux plateaux s'ouvrent.
- Connexion directe d'un PC à l'autre (WebRTC). Si elle est impossible (pare-feu, 4G, CGNAT), la partie passe automatiquement par le serveur de mise en relation, et revient en direct dès que possible : aucun port à ouvrir.
- Serveur de mise en relation gratuit à déployer une fois sur un compte Cloudflare (offre gratuite) : dossier gwent-signal, guide README-FR.md.
- En partie : nom et portrait de l'adversaire, Échap pour abandonner ; fin de partie « Retour au salon » pour enchaîner ; historique des parties avec le nom de l'adversaire, les abandons et les connexions perdues.
- Les deux jeux restent identiques (mêmes tirages aléatoires, mêmes décisions, contrôle du plateau à chaque coup).

## Divers
- Croix en haut à droite : infobulle « Quitter ».
- Les infobulles des icônes ne tournent plus avec l'icône (historique, paramètres).
- Quitter une partie pendant l'animation d'un coup ne provoque plus d'erreur.

# Version 2.2

## Plateau
- Roue crantée (paramètres) et nouvel historique des parties en haut à droite, comme dans le menu du deck ; les boutons Passer, musique, son et messages ne sont plus sur le plateau (tout est dans les paramètres).
- Passer : maintenir la barre Espace, comme dans TW3 (une jauge se remplit ; un appui bref ne passe pas). L'indication « Espace Passer tour (maintenir) » en bas à droite peut aussi être maintenue à la souris.
- Nombres plus proches de TW3 : puissance des cartes, scores des lignes et score total moins épais ; scores des lignes recentrés dans leurs médaillons ; nombre de cartes du paquet en gras avec une ombre.
- Puissance augmentée en vert (et non plus en jaune), diminuée en rouge, comme dans TW3.
- « A passé » n'est plus caché sous le score : il s'affiche sous le panneau de l'adversaire et au-dessus du vôtre.
- Écran de fin : « Personnaliser » devient « Menu principal ».

## Historique des parties
- Chaque partie est enregistrée sur l'ordinateur : date, résultat (victoire, défaite, égalité, abandon), votre chef et celui de l'adversaire, score de chaque manche, difficulté.
- Bilan en tête : parties, victoires, défaites, égalités, taux de victoire, et victoires – défaites pour chaque faction. Bouton pour effacer l'historique.

## Corrections
- Textes fantômes dans les carrousels (choix du chef, cartes à retirer, défausse) : les places vides gardaient le nom et la citation des cartes précédentes.
- Quitter une partie pendant un message de tour provoquait une erreur en arrière-plan.

# Version 2.1

## Menu du deck comme dans The Witcher 3
- En-tête de faction : « faction précédente ◄ écusson + faction ► faction suivante », un point par faction, avantage de faction en dessous. Flèches du clavier, clic sur les noms ou sur les points.
- Changement de faction : les cartes de l'ancienne faction s'estompent, celles de la nouvelle apparaissent en fondu ; le titre glisse dans le sens du changement.
- « Collection de cartes » et « Cartes du jeu » avec le filtre en cours (« TOUTES LES CARTES »…) et les 7 icônes de tri de TW3 : toutes, combat rapproché, distance, siège, héros, météo, spéciales (indépendantes pour chaque liste).
- Cartes des listes : nom seul, centré, et nombre d'exemplaires « x2 » en bas à gauche ; barre de défilement fine.
- Raccourcis affichés en bas à droite : Entrée (commencer la partie), ◄ ► (changer de faction), clic droit (examiner), Échap (paramètres).
- Roue crantée et croix (quitter le jeu) en haut à droite ; le reste du menu est épuré comme dans TW3.

## Paramètres (roue crantée, Échap dans le menu du deck, roue crantée du plateau en partie)
- Affichage : Fenêtré, Fenêtre sans bord (couvre tout l'écran), Plein écran — mémorisé ; F11 / Alt+Entrée bascule entre le plein écran et le mode fenêtre choisi. Une application WebView n'a pas de plein écran « exclusif » comme un jeu DirectX : le plein écran est celui de Windows, la différence avec la fenêtre sans bord est surtout la rapidité du passage aux autres fenêtres.
- Son : musique oui/non et volume, source de la musique et ses actions (extraire de The Witcher 3, importer, ouvrir le dossier, revenir au streaming), effets sonores oui/non et volume.
- Partie : difficulté, messages de jeu, langue (depuis le menu du deck).
- Personnage : 20 personnages (Geralt, Ciri, Yennefer, Triss, Jaskier, Zoltan, Vesemir, Régis, Avallac'h, Olgierd, Gaunter de Meuré, Keira, Roche, Dijkstra, Philippa, Iorveth, Eithné, Letho, Cerys, Sac-à-souris). Purement cosmétique : portrait et nom à côté de votre score.
- Deck : importer / exporter.
- Libellés officiels de TW3 (« Mode d'affichage », « Fenêtre sans bord », « Volume musique », « Volume bruitages », « Mode de difficulté »…).

## Plateau
- Portraits à côté des scores : le personnage choisi pour vous, le visage du chef de son deck pour l'adversaire (Foltest, Emhyr, Eredin, Francesca, Crach an Craite, Roi Bran…), avec leurs noms (aussi sur l'écran de fin).
- Carte jouée (par vous ou l'adversaire) : d'abord présentée sur la droite, puis elle glisse vers sa rangée ; petites braises à sa pose ; les héros ont un éclat doré.
- Charge (Sonnerie de la charge) : la rangée concernée prend une lueur dorée.
- La couronne de laurier autour du score du meneur « respire » doucement.
- Fin de manche : la gemme de vie se fissure puis vole en éclats.
- Carrousels fluides (les cartes glissent), main qui se soulève au survol, pièce qui tourne, fondus des fenêtres, du zoom et de l'aperçu.

## Textes officiels
- Toutes les citations et descriptions françaises (et anglaises) lues dans les fichiers de votre installation de The Witcher 3 (lecture seule). Les images des cartes ne portent plus de texte : noms et citations sont écrits dans la langue choisie, avec la police du jeu fournie (identique sur tous les PC).
- Cartes neutres, spéciales et météo : ruban aux couleurs de la faction du deck, comme dans TW3.
- Chefs : images corrigées (plusieurs chefs d'asundr montraient l'image d'un autre), capacité de Cerys (« Invocation de Vierges au bouclier »), notification de l'avantage du Nilfgaard en cas d'égalité.

## Musique
- Lecture locale des 7 musiques de Gwynt de The Witcher 3, extraites de votre installation (lecture seule, convertisseur intégré, rien n'est téléchargé) ; streaming YouTube en secours. Curseur de volume au survol des boutons son.

# Version 2.0

## Affichage et entrées
- Le jeu est une scène 16:9 mise à l'échelle dans la fenêtre (bandes latérales floutées si le format diffère) : plus aucune barre de défilement ni défilement parasite, quelle que soit la taille de la fenêtre ou la mise à l'échelle Windows.
- Touchpad : le défilement à deux doigts fait défiler les carrousels (cartes, chefs, factions, défausse) et les listes du deck ; le pincement ne zoome plus la page ; l'appui à deux doigts ouvre le zoom de la carte.
- Clic droit (ou appui long en tactile) sur n'importe quelle carte, y compris sur le plateau et pendant le tour adverse : zoom de la carte avec sa description. Un clic, Échap ou la molette le ferme.
- Clavier : Échap annule la sélection / ferme le carrousel / ouvre le menu Quitter ; ←/→ et Entrée dans les carrousels ; F11 ou Alt+Entrée pour le plein écran.
- Les cartes ne « sautent » plus au survol (elles s'éloignaient du pointeur) ; les cibles possibles du Leurre clignotent.

## Français
- Interface, notifications, popups, deck, fin de partie entièrement en français ; bascule FR/EN dans les Paramètres (roue crantée).
- Noms des cartes, capacités, chefs et factions d'après la VF officielle de The Witcher 3 et le manuel officiel du Gwynt (CD PROJEKT RED).
- Le texte anglais imprimé sur les grandes cartes est effacé et remplacé par le nom français (les rubans de faction sont conservés).

## Difficulté
- Facile / Normal / Difficile (dans les Paramètres, mémorisé).
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
