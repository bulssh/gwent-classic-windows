# Serveur de mise en relation de Gwent Classic (Cloudflare Worker, gratuit)

Ce petit serveur relie deux joueurs qui ont le même code de partie (6 caractères). Il transmet la
« poignée de main » WebRTC, puis la partie se joue directement d'un PC à l'autre. Quand aucune
connexion directe n'est possible (pare-feu strict, 4G avec CGNAT des deux côtés, réseau qui bloque
l'UDP), il relaie lui-même les messages du jeu : la partie fonctionne donc sur tous les réseaux.

Coût : 0 €. Il tourne sur l'offre gratuite de Cloudflare Workers (Durable Objects SQLite,
100 000 requêtes par jour). Une partie consomme quelques requêtes, même en mode relais (les
messages entrants sont comptés 20 pour 1 et une connexion inactive ne coûte rien).

## Sécurité du compte Cloudflare

- **Aucune facture possible sur l'offre gratuite** : une fois une limite quotidienne atteinte, les
  requêtes échouent jusqu'à minuit UTC au lieu d'être facturées. Ne souscrivez pas à l'offre
  Workers Paid et n'ajoutez pas de moyen de paiement : le pire scénario reste alors une panne du mode
  en ligne pour la journée.
- **Compte dédié recommandé** : utilisez un compte Cloudflare réservé à ce serveur (avec une adresse
  e-mail dédiée), sans nom de domaine ni autre service dessus, et activez la double
  authentification (My Profile → Authentication).
- Le code public ne contient ni identifiant de compte ni jeton. Le jeton créé par `wrangler login`
  reste sur votre PC : `npx wrangler logout` le révoque quand vous ne déployez plus.
- Le serveur ne stocke aucune donnée personnelle (voir plus bas) et ne lit aucun secret.

## Déploiement (une seule fois, environ 5 minutes)

Il faut Node.js (version LTS, https://nodejs.org) et un compte Cloudflare gratuit
(https://dash.cloudflare.com/sign-up, aucune carte bancaire demandée pour l'offre gratuite).

Dans un terminal (PowerShell), depuis ce dossier :

```
npm install
npx wrangler login
npx wrangler deploy
```

- `wrangler login` ouvre le navigateur pour autoriser Wrangler sur votre compte.
- Au premier déploiement, Wrangler propose de créer votre sous-domaine `*.workers.dev` : choisissez
  un nom (par exemple votre pseudo).
- À la fin, Wrangler affiche l'adresse du serveur, du type
  `https://gwent-classic-signal.<votre-sous-domaine>.workers.dev`.

Vérification : ouvrir cette adresse suivie de `/health` dans un navigateur doit afficher
`{"service":"gwent-classic-signal","ok":true}`.

## Dans le jeu

Partie en ligne (icône globe en haut à droite du menu du deck) → en bas de la fenêtre,
« Serveur de mise en relation » : coller l'adresse. Les deux joueurs doivent indiquer la même.
L'adresse par défaut est définie dans `game/online.js` (`ONLINE_DEFAULT_SERVER`).

## Mettre à jour ou supprimer

- Mise à jour : `npx wrangler deploy` à nouveau.
- Suppression : `npx wrangler delete` (ou depuis le tableau de bord Cloudflare, Workers & Pages).

## Ce que le serveur voit et garde

- Il ne garde rien, sauf l'heure de création de chaque salon et une clé aléatoire par joueur (qui
  permet de revenir après une coupure). Un salon quitté disparaît aussitôt, un salon vidé par des
  coupures réseau au bout de 2 minutes ; un salon sans second joueur est fermé au bout de 30 minutes,
  tout salon au bout de 6 heures.
- Connaître le code d'un salon ne suffit pas à prendre la place d'un joueur : il faut sa clé.
- Un client qui envoie trop de messages (plus de 300 en 10 secondes) est déconnecté.
- En mode direct (P2P), il ne voit passer que la poignée de main WebRTC (adresses réseau des deux
  PC). En mode relais, il voit passer les coups joués (messages JSON).

## Test en local

```
npx wrangler dev
```

puis, dans le jeu, l'adresse `ws://127.0.0.1:8787` (les connexions non chiffrées `ws://` ne sont
acceptées que vers ce PC). Tests : `node test/security.mjs`, puis depuis la racine du dépôt
`python3 server/test/room_flow.py` et `python3 server/test/two_clients.py 2 wsdrop`.
