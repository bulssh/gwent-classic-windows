# Serveur de mise en relation de Gwent Classic (Cloudflare Worker, gratuit)

Ce petit serveur relie deux joueurs qui ont le même code de partie (6 caractères). Il transmet la
« poignée de main » WebRTC, puis la partie se joue directement d'un PC à l'autre. Quand aucune
connexion directe n'est possible (pare-feu strict, 4G avec CGNAT des deux côtés, réseau qui bloque
l'UDP), il relaie lui-même les messages du jeu : la partie fonctionne donc sur tous les réseaux.

Coût : 0 €. Il tourne sur l'offre gratuite de Cloudflare Workers (Durable Objects SQLite,
100 000 requêtes par jour). Une partie consomme quelques requêtes, même en mode relais (les
messages entrants sont comptés 20 pour 1 et une connexion inactive ne coûte rien).

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
Elle peut aussi être intégrée à l'installateur : il suffit de me la donner.

## Mettre à jour ou supprimer

- Mise à jour : `npx wrangler deploy` à nouveau.
- Suppression : `npx wrangler delete` (ou depuis le tableau de bord Cloudflare, Workers & Pages).

## Ce que le serveur voit et garde

- Il ne garde rien, sauf l'heure de création de chaque salon. Un salon vide disparaît aussitôt ; un
  salon sans second joueur est fermé au bout de 30 minutes, tout salon au bout de 6 heures.
- En mode direct (P2P), il ne voit passer que la poignée de main WebRTC (adresses réseau des deux
  PC). En mode relais, il voit passer les coups joués (messages JSON).

## Test en local

```
npx wrangler dev
```

puis, dans le jeu, l'adresse `ws://127.0.0.1:8787`.
