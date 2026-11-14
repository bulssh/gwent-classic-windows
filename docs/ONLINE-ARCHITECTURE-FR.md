# Mode en ligne 1v1 de Gwent Classic — architecture

## Vue d'ensemble

```
 PC de l'hôte (Tauri + WebView2)                          PC de l'invité (Tauri + WebView2)
 ┌──────────────────────────────┐                         ┌──────────────────────────────┐
 │ online.js  écrans + moteur   │                         │ online.js  écrans + moteur   │
 │ net.js     liaison           │◄── DataChannel WebRTC ─►│ net.js     liaison           │
 │            (P2P, UDP)        │      (cas normal)       │                              │
 └──────────────┬───────────────┘                         └───────────────┬──────────────┘
                │ WebSocket wss://…/room/CODE (443)                       │
                │  1. poignée de main WebRTC (offre, réponse, ICE)        │
                │  2. relais des messages si pas de P2P possible          │
                ▼                                                         ▼
          ┌───────────────────────────────────────────────────────────────────┐
          │ Cloudflare Worker (offre gratuite) → Durable Object « Room »       │
          │ un objet par code ; il transmet d'un joueur à l'autre, ne stocke   │
          │ rien (WebSockets en hibernation : une connexion inactive est gratuite) │
          └───────────────────────────────────────────────────────────────────┘
```

Rien côté Rust : WebView2 (le moteur Chromium d'Edge) sait déjà faire WebRTC et WebSocket.

## Serveur (server/)

- `src/index.js` : `GET /room/<CODE>?role=host|guest` (WebSocket). Le Durable Object `Room` :
  - refuse un second hôte (`code-in-use`), un invité sans hôte (`no-room`), un troisième joueur (`room-full`) ;
  - accepte qu'un joueur revienne (`rejoin=1`, après une coupure réseau) ;
  - transmet tel quel chaque message à l'autre joueur, annonce les arrivées et départs (`peer`) ;
  - répond aux pings sans se réveiller ; se supprime quand il est vide ; ferme après 30 min sans invité, 6 h au plus.
- `wrangler.toml` : Durable Objects en stockage SQLite (obligatoire sur l'offre gratuite).
- Codes : 6 caractères parmi 32 (sans I, O, 0, 1), environ un milliard de combinaisons.

## Liaison (net.js)

- Ouverture : l'hôte tire un code et ouvre le salon (nouveau code si déjà pris) ; l'invité rejoint avec le code.
- WebRTC : serveurs STUN gratuits (Cloudflare, Google), un DataChannel ordonné et fiable. L'hôte fait l'offre.
- Pas de liaison directe en 9 s, ou liaison perdue : les messages passent par le salon (relais). La liaison
  directe est retentée, et le jeu y revient tout seul.
- Chaque message de jeu est numéroté ; à chaque changement de liaison, chacun redemande ce qu'il a manqué :
  rien n'est perdu ni appliqué deux fois.
- Ping toutes les 4 s ; adversaire considéré comme parti s'il quitte le salon et la liaison directe, ou après 45 s de silence.

## Protocole (messages JSON)

| Message | Contenu | Quand |
|---|---|---|
| `PlayerJoined` | version, empreinte des cartes, nom, personnage | arrivée dans le salon |
| `SelectDeck` | deck (faction, chef, cartes) | choix ou changement de deck |
| `SetReady` | prêt oui/non | bouton « Prêt » |
| `StartGame` | graine aléatoire | l'hôte lance la partie |
| `Redraw` | cartes renvoyées au paquet | après le choix des cartes à retirer |
| `ScoiaFirst` | qui commence | décision de l'avantage Scoia'tael |
| `PlayCard` | carte, rangée (côté + type) ou météo, cible du Leurre, empreinte du plateau | coup joué |
| `PlayLeader` / `Pass` | empreinte du plateau | capacité du chef, passer |
| `Choice` | carte choisie dans un carrousel | médecin, chefs (Eredin, Emhyr…) |
| `RowChoice` | rangée choisie | unité agile ressuscitée, Skellige manche 3 |
| `Forfeit` / `Leave` / `Lobby` | — | abandon, départ du salon, retour au salon |

Contrôle (non numéroté) : `ping`/`pong`, `sync` (dernier message reçu).

## Synchronisation du jeu (le point délicat)

Le jeu d'origine n'avait qu'un humain contre une IA. Les deux PC exécutent maintenant tout le moteur :
chacun est « moi » en bas du plateau et voit l'autre comme adversaire (`ControllerRemote` à la place de l'IA).
Seules les décisions circulent ; pour que les deux parties restent identiques :

- tirages aléatoires (mélanges, pile ou face, unité gardée par les Monstres, unités de Skellige, médecin
  d'Emhyr l'Envahisseur…) : générateurs initialisés avec la même graine, un par joueur (`Rng`, common.js),
  pour ne pas dépendre de l'ordre dans lequel les effets des deux joueurs s'exécutent ;
- ordre stable des cartes avant un tirage ; paquet remélangé de façon identique après Crach an Craite ;
- capacités de faction et de chef enregistrées dans le même ordre (hôte d'abord) ;
- cartes désignées par leur identité (nom, faction, image) et rangées par « côté du joueur qui agit » ;
- chaque coup porte une empreinte du plateau : une différence est signalée (aucune sur plus de 60 parties de test).

## Écrans (online.js)

- Icône globe en haut à droite du menu du deck (point vert quand un salon est ouvert).
- Accueil : nom du joueur, « Créer une partie », « Rejoindre une partie », adresse du serveur.
- Rejoindre : champ code (6 caractères, majuscules automatiques), « Valider », erreurs claires.
- Salon : code en grand + « Copier », état de la liaison (directe / relais), deux fiches joueur
  (portrait, nom, hôte/invité, deck en liste déroulante ou résumé, decks incomplets grisés, bouton « Prêt »),
  « Lancer la partie » grisé tant que les deux ne sont pas prêts, « Quitter le salon ».
- En partie : nom et portrait choisis par l'adversaire ; Échap = abandonner.
- Fin de partie : « Retour au salon » ; l'historique note les parties en ligne (nom de l'adversaire, abandon, connexion perdue).

## Limites connues

- Chaque PC calcule toute la partie : un client modifié pourrait lire la main adverse. Sans importance
  entre amis ; l'empêcher demanderait de faire tourner le jeu sur le serveur.
- Les deux joueurs doivent avoir la même version (vérifié à la connexion).
- En mode relais, le serveur voit passer les coups (pas de chiffrement de bout en bout au-delà du TLS).

## Tests

`test/two_clients.py` lance deux clients du jeu contre le Worker local (`wrangler dev`) et fait jouer des
parties complètes à deux robots qui passent par l'interface : résultats inversés identiques, aucune
désynchronisation, en P2P, en relais seul, et avec coupure de la liaison directe en pleine partie.
`test/room_flow.py` : code inconnu, revanche dans le même salon, abandon, départ, retour d'un invité.
