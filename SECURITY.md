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
- le **serveur de mise en relation** (`server/`) : déni de service, prendre la place d'un joueur ou lire ses messages.

Limites connues, hors périmètre :
- **Adresse IP** : en connexion directe (P2P), chaque joueur voit l'adresse IP publique de l'autre, comme dans tout jeu en pair à pair. Ne jouez en ligne qu'avec des personnes à qui vous donnez le code vous-même.
- **Triche** : chaque PC calcule toute la partie et l'hôte tire la graine du hasard ; un joueur qui modifie son jeu peut tricher (voir [docs/ONLINE-ARCHITECTURE-FR.md](docs/ONLINE-ARCHITECTURE-FR.md)).

## Mesures en place
- Page de jeu soumise à une politique de sécurité du contenu (CSP) stricte : seuls les scripts de l'application s'exécutent.
- Textes reçus du réseau ou de fichiers importés toujours affichés comme du texte, jamais comme du HTML.
- Commandes natives limitées : la page n'a accès à aucune boîte de dialogue ni au système de fichiers. Les boîtes « Ouvrir » et « Enregistrer sous » sont ouvertes par l'application elle-même, qui n'écrit que dans le fichier choisi ou dans son dossier musique (fichiers audio uniquement, 128 Mo au plus). L'installation de TW3 est lue en lecture seule (seulement les fichiers `soundspc.cache`).
- Serveur de mise en relation : chaque joueur reçoit une clé secrète à son arrivée ; connaître le code d'un salon ne suffit pas pour prendre sa place. Messages limités en taille (64 Ko) et en débit, salons à durée de vie limitée, aucune donnée personnelle stockée.
- Connexions au serveur toujours chiffrées (`wss://`), sauf vers ce PC pour le développement.
- Installateurs compilés par GitHub Actions à partir du code public, avec empreintes SHA-256 et attestation de provenance.
- Analyse automatique du code (CodeQL), alertes sur les dépendances (Dependabot), détection des secrets.
