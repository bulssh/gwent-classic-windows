# Créer son serveur pour jouer en ligne (gratuit, environ 5 minutes)

Le mode en ligne de Gwent Classic a besoin d'un petit **serveur de mise en relation** : il présente les deux joueurs l'un à l'autre, puis la partie se joue directement d'un PC à l'autre. Quand la connexion directe est impossible (pare-feu strict, 4G des deux côtés…), il relaie lui-même les coups.

**Il n'y a pas de serveur commun** : chaque groupe de joueurs utilise le sien, hébergé gratuitement sur un compte Cloudflare. Personne d'autre, pas même l'auteur du jeu, ne voit passer vos parties ni ne consomme votre quota.

> **Un seul des deux joueurs** crée le serveur, une seule fois. Il donne ensuite son adresse à ses adversaires : tout le monde indique la même adresse dans le jeu.

## Avant de commencer
- Un **compte Cloudflare gratuit** : https://dash.cloudflare.com/sign-up (aucune carte bancaire demandée).
- Conseillé : activer la **double authentification** sur ce compte (My Profile → Authentication).

## Méthode 1 — avec le bouton, sans rien installer
Il faut aussi un compte **GitHub** (gratuit), sur lequel Cloudflare dépose une copie du code du serveur.

1. Cliquez sur ce bouton :

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bulssh/gwent-classic-windows/tree/main/server)

2. Connectez-vous à Cloudflare, puis autorisez Cloudflare à accéder à votre compte GitHub.
3. Gardez les noms proposés (`gwent-classic-signal`) et cliquez sur **Create and deploy**.
4. Si c'est votre premier Worker, Cloudflare vous fait choisir un sous-domaine `*.workers.dev` : prenez un pseudo, pas votre nom.
5. À la fin, l'adresse du serveur s'affiche (Workers & Pages → `gwent-classic-signal`). Elle a la forme `https://gwent-classic-signal.<votre-sous-domaine>.workers.dev`.

## Méthode 2 — depuis votre PC Windows
1. Installez **Node.js** (version LTS) : https://nodejs.org
2. Téléchargez `gwent-classic-serveur-<version>.zip` depuis la [dernière version](https://github.com/bulssh/gwent-classic-windows/releases/latest) et décompressez-le.
3. Dans le dossier décompressé, faites clic droit → **Ouvrir dans le terminal**, puis tapez :
   ```
   npm.cmd install
   npx.cmd wrangler login
   npx.cmd wrangler deploy
   ```
   - `wrangler login` ouvre le navigateur pour autoriser l'outil sur votre compte Cloudflare.
   - Au premier déploiement, Wrangler propose de créer votre sous-domaine `*.workers.dev` : prenez un pseudo, pas votre nom.
   - Écrivez bien `npm.cmd` et `npx.cmd` : sous Windows, `npm` tout court est souvent bloqué par la politique d'exécution de PowerShell.
4. À la fin, Wrangler affiche l'adresse du serveur : `https://gwent-classic-signal.<votre-sous-domaine>.workers.dev`.
5. Facultatif : `npx.cmd wrangler logout` retire l'autorisation donnée à l'étape 3 (il faudra se reconnecter pour une mise à jour).

## Vérifier que le serveur marche
Ouvrez l'adresse du serveur suivie de `/health` dans un navigateur. Vous devez voir :
`{"service":"gwent-classic-signal","ok":true}`

## Jouer
1. Dans le jeu, ouvrez **Partie en ligne** (globe en haut à droite du menu du deck).
2. Collez l'adresse dans **Serveur de mise en relation**, en bas de la fenêtre.
3. Envoyez à votre adversaire **l'adresse du serveur et le code de la partie**. Il colle la même adresse, puis clique sur **Rejoindre une partie**.

L'adresse est retenue : il n'y a plus rien à saisir pour les parties suivantes.

## Coût, sécurité et vie privée
- **0 €, sans risque de facture** : sur l'offre gratuite, une limite quotidienne dépassée fait échouer les requêtes jusqu'à minuit UTC au lieu d'être facturée. Ne souscrivez pas l'offre *Workers Paid* : le pire cas reste alors un mode en ligne indisponible jusqu'au lendemain. Une partie ne consomme que quelques requêtes, même relayée.
- **Compte dédié conseillé** : par prudence, utilisez un compte Cloudflare réservé à ce serveur, sans nom de domaine ni autre service dessus.
- **Ce que le serveur garde** : l'heure de création de chaque salon et une clé aléatoire par joueur, qui permet de revenir après une coupure réseau. Tout est effacé à la fermeture du salon. Un salon quitté disparaît aussitôt, un salon vidé par des coupures au bout de 2 minutes. Un salon sans second joueur ferme au bout de 30 minutes, tout salon au bout de 6 heures.
- **Ce qu'il voit passer** : en connexion directe, seulement la « poignée de main » WebRTC (adresses réseau des deux PC) ; en relais, les coups joués.
- **Protection** : connaître le code d'un salon ne suffit pas à prendre la place d'un joueur (il faut sa clé), et un client qui envoie trop de messages (plus de 300 en 10 secondes) est déconnecté.
- **Qui peut s'en servir** : toute personne qui connaît l'adresse, sur votre quota. Ne la donnez qu'à vos adversaires.

## Mettre à jour ou supprimer
- **Mise à jour** : refaites la méthode 2 avec le zip de la nouvelle version. Avec le même compte et le même nom, l'adresse ne change pas.
- **Suppression** : `npx.cmd wrangler delete`, ou depuis le tableau de bord Cloudflare (Workers & Pages → `gwent-classic-signal` → Settings → Delete).

## Pour les développeurs : test en local
```
npm install
npx wrangler dev
```
Dans le jeu, indiquez l'adresse `ws://127.0.0.1:8787` : les connexions non chiffrées (`ws://`) ne sont acceptées que vers votre propre PC.

Tests, depuis la racine du dépôt (avec `npx wrangler dev` lancé) :
- `node server/test/security.mjs`
- `python3 server/test/room_flow.py`
- `python3 server/test/two_clients.py 2 wsdrop`

Fonctionnement détaillé : [docs/ONLINE-ARCHITECTURE-FR.md](../docs/ONLINE-ARCHITECTURE-FR.md).
