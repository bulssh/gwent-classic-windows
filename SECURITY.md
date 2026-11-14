# Politique de sécurité

## Versions suivies
Seule la **dernière version** publiée dans les [Releases](https://github.com/bulssh/gwent-classic-windows/releases) reçoit des correctifs de sécurité.

## Signaler une faille
**N'ouvrez pas d'issue publique.** Utilisez le signalement privé de GitHub : onglet **Security** → **Report a vulnerability** ([lien direct](https://github.com/bulssh/gwent-classic-windows/security/advisories/new)).

Indiquez la version concernée, les étapes pour reproduire et l'impact possible. Une première réponse est donnée sous 7 jours. Le correctif est publié dans une nouvelle version, puis la faille est décrite dans un avis de sécurité.

## Périmètre
Sont concernés en priorité :
- l'**application Windows** (`desktop/`) : exécution de code, lecture ou écriture de fichiers hors de ce qui est prévu ;
- le **mode en ligne** (`game/net.js`, `game/online.js`) : tout ce qu'un adversaire ou un tiers peut faire au PC d'un joueur à travers les messages de la partie ;
- le **serveur de mise en relation** (`server/`) : déni de service, accès à une partie dont on n'a pas le code.

La triche entre deux joueurs est hors périmètre : chaque PC calcule toute la partie, c'est une limite connue du mode en ligne (voir [docs/ONLINE-ARCHITECTURE-FR.md](docs/ONLINE-ARCHITECTURE-FR.md)).

## Mesures en place
- Page de jeu soumise à une politique de sécurité du contenu (CSP) stricte : seuls les scripts de l'application s'exécutent.
- Textes reçus du réseau ou de fichiers importés toujours affichés comme du texte, jamais comme du HTML.
- Commandes natives limitées : écriture uniquement dans le fichier choisi dans la boîte « Enregistrer sous » ou dans le dossier musique de l'application ; installation de TW3 lue en lecture seule.
- Installateurs compilés par GitHub Actions à partir du code public, avec empreintes SHA-256 et attestation de provenance.
- Analyse automatique du code (CodeQL), alertes sur les dépendances (Dependabot), détection des secrets.
